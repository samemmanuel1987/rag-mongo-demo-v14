import express from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.MODERATION_PORT || 3000);
const configuredJwtSecret = process.env.MODERATION_JWT_SECRET || process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' &&
  (!configuredJwtSecret || Buffer.byteLength(configuredJwtSecret) < 32)) {
  throw new Error('Production requires MODERATION_JWT_SECRET (or JWT_SECRET) with at least 32 bytes.');
}
const JWT_SECRET = configuredJwtSecret || 'local-dev-secret-change-me';
const ALLOWED_ROLES = new Set([
  'moderation.user',
  'moderation.admin',
  'moderation.reviewer',
  'moderation.tester'
]);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function authenticate(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }

  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) throw new Error('Invalid token');
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const expected = createHmac('sha256', JWT_SECRET).update(`${headerPart}.${payloadPart}`).digest();
    const actual = Buffer.from(signaturePart, 'base64url');

    if (header.alg !== 'HS256' || actual.length !== expected.length || !timingSafeEqual(actual, expected) ||
      !ALLOWED_ROLES.has(claims.role) || claims.iss !== 'local-dev' || claims.aud !== 'guardrail-gateway' ||
      !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid token');
    }

    req.auth = claims;
    next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }
}

function inspectContent(content, isOutput, requestId) {
  const zeroWidthMatches = content.match(/[\u200B-\u200D\uFEFF]/g) || [];
  let sanitizedContent = content.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const findings = [];

  if (/(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{8,}/i.test(sanitizedContent)) {
    findings.push({ control: 'SECRET', recommendedAction: 'BLOCK' });
  }
  if (/(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|reveal\s+(the\s+)?system\s+prompt|developer\s+mode|ignore\s+all\s+safety\s+rules)/i.test(sanitizedContent)) {
    findings.push({ control: 'PROMPT_INJECTION', recommendedAction: 'BLOCK' });
  }
  if (/classification\s*:\s*restricted|\bconfidential\s+(customer|business|patient)\b/i.test(sanitizedContent)) {
    findings.push({ control: 'CONFIDENTIAL_DATA', recommendedAction: 'BLOCK' });
  }

  const blocked = findings.some(finding => finding.recommendedAction === 'BLOCK');
  if (blocked) {
    return {
      requestId,
      decision: 'BLOCK',
      recommendedAction: 'BLOCK',
      matched: true,
      findings,
      ...(isOutput ? { safe: false } : {})
    };
  }

  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const containsEmail = emailPattern.test(sanitizedContent);
  emailPattern.lastIndex = 0;
  sanitizedContent = sanitizedContent.replace(emailPattern, '<EMAIL_MASKED>');
  if (containsEmail) findings.push({ control: 'PII', recommendedAction: 'MASK' });

  const decision = containsEmail ? 'MASK' : 'ALLOW';
  return {
    requestId,
    decision,
    recommendedAction: decision,
    matched: containsEmail,
    findings,
    sanitizedContent,
    normalization: { zeroWidthRemoved: zeroWidthMatches.length },
    ...(isOutput ? { safe: true } : {})
  };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'UP' });
});

function moderate(isOutput) {
  return (req, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }

    const requestId = req.get('X-Correlation-ID') || req.body.originalRequestId || randomUUID();
    return res.json(inspectContent(content, isOutput, requestId));
  };
}

app.post('/api/v1/moderate', authenticate, moderate(false));
app.post('/api/v1/moderate/output', authenticate, moderate(true));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'INVALID_REQUEST' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
  }
  console.error('Moderation gateway request failed:', error.message);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`Moderation Layer gateway listening on port ${PORT}`);
});
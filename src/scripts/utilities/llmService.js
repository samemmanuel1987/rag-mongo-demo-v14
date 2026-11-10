/**
 * Unified Multi-LLM Service
 * 
 * Supports:
 * - Groq (llama-3.3-70b-versatile, llama-3.2-3b-preview, qwen/qwen3.6-27b, openai/gpt-oss-120b, etc.)
 * - OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, etc.)
 * - Claude / Anthropic (claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229)
 * - Gemini / Google (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.5-flash)
 * - Mistral AI (mistral-large-latest, mistral-small-latest, codestral-latest)
 * 
 * Features:
 * - Dynamic configuration via environment variables or runtime overrides
 * - Automatic Fallback on rate limit (429, 8k token limits, TPM limits), timeouts, or errors
 * - Document reranking, summarization, and question answering
 * - Connection testing for all providers
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
import { createHmac, randomUUID } from 'crypto';

dotenv.config();

const configuredModerationSecret = process.env.MODERATION_JWT_SECRET || process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' &&
  (!configuredModerationSecret || Buffer.byteLength(configuredModerationSecret) < 32)) {
  throw new Error('Production requires MODERATION_JWT_SECRET (or JWT_SECRET) with at least 32 bytes.');
}
const moderationJwtSecret = configuredModerationSecret || 'local-dev-secret-change-me';

function createModerationToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: 'rag-application',
    role: 'moderation.user',
    iss: 'local-dev',
    aud: 'guardrail-gateway',
    iat: now,
    exp: now + 3600
  });
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', moderationJwtSecret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

async function requestModeration(endpoint, content, requestId) {
  if (process.env.MODERATION_ENABLED === 'false') {
    return { decision: 'ALLOW', sanitizedContent: content, bypassed: true };
  }

  const baseUrl = (process.env.MODERATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    const response = await axios.post(`${baseUrl}${endpoint}`, {
      content,
      ...(endpoint.endsWith('/output') ? { originalRequestId: requestId } : {})
    }, {
      timeout: Number(process.env.MODERATION_TIMEOUT_MS || 5000),
      headers: {
        Authorization: `Bearer ${createModerationToken()}`,
        'Content-Type': 'application/json',
        'X-Correlation-ID': requestId
      }
    });
    return response.data;
  } catch {
    const error = new Error('Moderation service unavailable');
    error.code = 'MODERATION_UNAVAILABLE';
    throw error;
  }
}

function assertModerationAllowed(result, stage) {
  const action = String(result.decision || result.recommendedAction || '').toUpperCase();
  if (!['ALLOW', 'MASK'].includes(action) || (stage === 'output' && result.safe !== true) ||
    (action === 'MASK' && typeof result.sanitizedContent !== 'string')) {
    const error = new Error(`${stage === 'input' ? 'Input' : 'Generated response'} blocked by moderation policy`);
    error.code = 'MODERATION_BLOCKED';
    error.stage = stage;
    error.decision = action || 'BLOCK';
    throw error;
  }
  return action;
}

async function moderateLLMOutput(result, requestId) {
  const content = typeof result.content === 'string' ? result.content : '';
  const outputCheck = await requestModeration('/api/v1/moderate/output', content, `${requestId}-output`);
  const outputDecision = assertModerationAllowed(outputCheck, 'output');
  return {
    ...result,
    content: typeof outputCheck.sanitizedContent === 'string' ? outputCheck.sanitizedContent : content,
    moderation: { outputDecision }
  };
}

// Provider Presets & Default Models
export const PROVIDER_PRESETS = {
  groq: {
    name: 'Groq AI',
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B (High Capability / Default)' },
      { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B (Fast & Accurate)' },
      { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B (Ultra Fast / Lightweight)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (8k Fast)' },
      { id: 'allam-2-7b', name: 'ALLaM 2 7B' },
      { id: 'groq/compound', name: 'Groq Compound' },
      { id: 'groq/compound-mini', name: 'Groq Compound Mini' }
    ],
    keyEnv: 'GROQ_API_KEY',
    requiresKey: true
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost Efficient)' },
      { id: 'gpt-4o', name: 'GPT-4o (High Intelligence / Multimodal)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    keyEnv: 'OPENAI_API_KEY',
    requiresKey: true
  },
  claude: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast & Precise)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (State of the Art QA)' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Deep Reasoning)' }
    ],
    keyEnv: 'ANTHROPIC_API_KEY',
    requiresKey: true
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Ultra Fast & Generous Limits)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Large 2M Context)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next Gen)' }
    ],
    keyEnv: 'GEMINI_API_KEY',
    requiresKey: true
  },
  mistral: {
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small (Fast & Efficient)' },
      { id: 'mistral-large-latest', name: 'Mistral Large (High Capability)' },
      { id: 'codestral-latest', name: 'Codestral (Code & Test Generation)' }
    ],
    keyEnv: 'MISTRAL_API_KEY',
    requiresKey: true
  }
};

/**
 * Get active configuration from environment variables
 */
export function getLLMConfig() {
  const provider = (process.env.LLM_PROVIDER || process.env.GENERATION_PROVIDER || 'groq').toLowerCase().trim();
  const model = process.env.LLM_MODEL || process.env.GENERATION_MODEL || PROVIDER_PRESETS[provider]?.defaultModel || 'openai/gpt-oss-120b';

  const rerankProvider = (process.env.RERANK_PROVIDER || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();
  const rerankModel = process.env.RERANK_MODEL || process.env.GROQ_RERANK_MODEL || PROVIDER_PRESETS[rerankProvider]?.defaultModel || 'openai/gpt-oss-120b';

  const summarizationProvider = (process.env.SUMMARIZATION_PROVIDER || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();
  const summarizationModel = process.env.SUMMARIZATION_MODEL || process.env.GROQ_SUMMARIZATION_MODEL || PROVIDER_PRESETS[summarizationProvider]?.defaultModel || 'openai/gpt-oss-120b';

  const enableFallback = process.env.ENABLE_FALLBACK === 'true' || process.env.ENABLE_FALLBACK === true;
  const fallbackProvider = (process.env.FALLBACK_LLM_PROVIDER || 'mistral').toLowerCase().trim();
  const fallbackModel = process.env.FALLBACK_LLM_MODEL || PROVIDER_PRESETS[fallbackProvider]?.defaultModel || 'mistral-small-latest';

  const enableTokenOptimization = process.env.ENABLE_TOKEN_OPTIMIZATION !== 'false';
  const maxTotalTokens = parseInt(process.env.MAX_TOTAL_TOKENS || '8000', 10);
  const maxGenerationTokens = parseInt(process.env.MAX_GENERATION_TOKENS || '3000', 10);
  const maxSummaryTokens = parseInt(process.env.MAX_SUMMARY_TOKENS || '400', 10);

  return {
    provider,
    model,
    generation: { provider, model },
    rerank: { provider: rerankProvider, model: rerankModel },
    summarization: { provider: summarizationProvider, model: summarizationModel },
    enableFallback,
    fallbackProvider,
    fallbackModel,
    enableTokenOptimization,
    maxTotalTokens,
    maxGenerationTokens,
    maxSummaryTokens,
    tokenOptimization: {
      enabled: enableTokenOptimization,
      maxTotalTokens,
      maxGenerationTokens,
      maxSummaryTokens
    },
    groqApiKey: process.env.GROQ_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    mistralApiKey: process.env.MISTRAL_API_KEY
  };
}

/**
 * Get the API key for a specific provider
 */
export function getApiKeyForProvider(provider, config = null) {
  const cfg = config || getLLMConfig();
  switch (provider.toLowerCase()) {
    case 'groq':
      return cfg.groqApiKey || process.env.GROQ_API_KEY;
    case 'openai':
      return cfg.openaiApiKey || process.env.OPENAI_API_KEY;
    case 'claude':
    case 'anthropic':
      return cfg.anthropicApiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    case 'gemini':
    case 'google':
      return cfg.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    case 'mistral':
      return cfg.mistralApiKey || process.env.MISTRAL_API_KEY;
    default:
      return null;
  }
}

/**
 * Check if an error is a rate limit or resource exhaustion error
 */
export function isRateLimitOrRecoverableError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const status = error.status || error.statusCode || error.response?.status;

  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  const rateLimitKeywords = [
    'rate limit',
    'rate_limit_exceeded',
    'tokens per minute',
    'requests per minute',
    'tpm',
    'rpm',
    'quota',
    'resource exhausted',
    'overloaded',
    'capacity',
    'token limit',
    'context length exceeded',
    'maximum context length',
    'context_length_exceeded',
    'model_not_found',
    '8000',
    '8192',
    'timeout',
    'econnreset',
    'etimedout'
  ];

  return rateLimitKeywords.some(kw => message.includes(kw));
}

/**
 * Internal helper to execute a single LLM chat completion on a specific provider
 */
async function executeProviderCall({
  provider,
  model,
  messages,
  systemPrompt,
  temperature = 0.2,
  maxTokens = 3000,
  apiKeyOverride = null,
  baseUrlOverride = null
}) {
  const p = (provider || 'groq').toLowerCase().trim();
  const apiKey = apiKeyOverride || getApiKeyForProvider(p);

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error(`API key for provider '${p}' is not configured. Please set ${PROVIDER_PRESETS[p]?.keyEnv || p.toUpperCase() + '_API_KEY'} in Settings.`);
  }

  // Format messages if systemPrompt was given separately
  let formattedMessages = [];
  if (messages && messages.length > 0) {
    formattedMessages = [...messages];
  } else if (systemPrompt) {
    formattedMessages = [{ role: 'system', content: systemPrompt }];
  }

  const mName = model || PROVIDER_PRESETS[p]?.defaultModel || 'openai/gpt-oss-120b';
  const cfg = getLLMConfig();

  // Estimate prompt tokens (~3.8 characters per token average in JSON / English)
  const promptCharCount = formattedMessages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
  const estimatedPromptTokens = Math.ceil(promptCharCount / 3.8);

  // Safe Token Budget Clamping
  let safeMaxTokens = maxTokens;
  const isTokenOptimizationActive = cfg.enableTokenOptimization;
  const tokenBudgetCap = cfg.maxTotalTokens || 8000;

  if (p === 'groq' || isTokenOptimizationActive) {
    // Determine context ceiling (Groq context cap is 8192 for most models; respect user budget ceiling)
    const contextCeiling = Math.min(tokenBudgetCap, 8192);
    const availableRemainingTokens = Math.max(400, contextCeiling - estimatedPromptTokens - 150);
    safeMaxTokens = Math.min(maxTokens, availableRemainingTokens);
  }

  switch (p) {
    case 'groq': {
      const groqClient = new Groq({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      const response = await groqClient.chat.completions.create({
        messages: formattedMessages,
        model: mName,
        temperature,
        max_tokens: safeMaxTokens
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        content,
        provider: 'groq',
        model: mName,
        usage: {
          promptTokens: response.usage?.prompt_tokens || estimatedPromptTokens,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || (estimatedPromptTokens + (response.usage?.completion_tokens || 0))
        },
        raw: response
      };
    }

    case 'openai': {
      const openaiClient = new OpenAI({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      const response = await openaiClient.chat.completions.create({
        messages: formattedMessages,
        model: mName,
        temperature,
        max_tokens: maxTokens
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        content,
        provider: 'openai',
        model: mName,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        },
        raw: response
      };
    }

    case 'claude':
    case 'anthropic': {
      const anthropic = new Anthropic({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      // Separate system messages for Anthropic
      const systemMsgs = formattedMessages.filter(m => m.role === 'system');
      const nonSystemMsgs = formattedMessages.filter(m => m.role !== 'system');
      const systemText = systemMsgs.map(m => m.content).join('\n\n') || undefined;

      const response = await anthropic.messages.create({
        model: mName,
        system: systemText,
        messages: nonSystemMsgs.length > 0 ? nonSystemMsgs : [{ role: 'user', content: 'Hi' }],
        max_tokens: Math.min(maxTokens, 4096),
        temperature
      });

      const content = response.content.map(c => c.text || '').join('\n');
      return {
        content,
        provider: 'claude',
        model: mName,
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        },
        raw: response
      };
    }

    case 'gemini':
    case 'google': {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Extract system instructions and convert messages to Gemini history
      const systemMsgs = formattedMessages.filter(m => m.role === 'system');
      const systemInstruction = systemMsgs.map(m => m.content).join('\n\n') || undefined;
      const userAndModelMsgs = formattedMessages.filter(m => m.role !== 'system');

      const modelInstance = genAI.getGenerativeModel({
        model: mName,
        systemInstruction
      });

      // Construct prompt or multi-turn content
      if (userAndModelMsgs.length === 1 && userAndModelMsgs[0].role === 'user') {
        const textContent = userAndModelMsgs[0].content;
        const result = await modelInstance.generateContent({
          contents: [{ role: 'user', parts: [{ text: textContent }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        });
        const response = await result.response;
        const content = response.text();
        const usageMetadata = response.usageMetadata;

        return {
          content,
          provider: 'gemini',
          model: mName,
          usage: {
            promptTokens: usageMetadata?.promptTokenCount || Math.ceil(textContent.length / 4),
            completionTokens: usageMetadata?.candidatesTokenCount || Math.ceil(content.length / 4),
            totalTokens: usageMetadata?.totalTokenCount || (Math.ceil(textContent.length / 4) + Math.ceil(content.length / 4))
          },
          raw: response
        };
      } else {
        // Multi-message conversation
        const contents = userAndModelMsgs.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        const result = await modelInstance.generateContent({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        });
        const response = await result.response;
        const content = response.text();
        const usageMetadata = response.usageMetadata;

        return {
          content,
          provider: 'gemini',
          model: mName,
          usage: {
            promptTokens: usageMetadata?.promptTokenCount || 0,
            completionTokens: usageMetadata?.candidatesTokenCount || 0,
            totalTokens: usageMetadata?.totalTokenCount || 0
          },
          raw: response
        };
      }
    }

    case 'mistral': {
      const mistralUrl = baseUrlOverride || 'https://api.mistral.ai/v1';
      const response = await axios.post(
        `${mistralUrl}/chat/completions`,
        {
          model: mName,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 60000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      return {
        content,
        provider: 'mistral',
        model: mName,
        usage: {
          promptTokens: response.data?.usage?.prompt_tokens || 0,
          completionTokens: response.data?.usage?.completion_tokens || 0,
          totalTokens: response.data?.usage?.total_tokens || 0
        },
        raw: response.data
      };
    }

    default:
      throw new Error(`Unsupported LLM provider: '${p}'. Supported: groq, openai, claude, gemini, mistral`);
  }
}

/**
 * Main Chat Completion function with automatic fallback failover
 */
export async function chatCompletion(arg1 = {}, options = {}) {
  let opts = {};
  if (Array.isArray(arg1)) {
    opts = { ...options, messages: arg1 };
  } else if (typeof arg1 === 'string') {
    opts = { ...options, prompt: arg1 };
  } else {
    opts = { ...arg1, ...options };
  }

  let {
    messages = [],
    prompt = null,
    systemPrompt = null,
    temperature = 0.2,
    maxTokens = 4000,
    provider = null,
    model = null,
    baseUrl = null,
    apiKey = null,
    enableFallbackOverride = null
  } = opts;

  const config = getLLMConfig();
  const primaryProvider = (provider || config.provider).toLowerCase();
  const primaryModel = model || (provider ? PROVIDER_PRESETS[provider]?.defaultModel : config.model);
  const primaryBaseUrl = baseUrl || (provider ? null : config.baseUrl);
  const isFallbackEnabled = enableFallbackOverride !== null ? enableFallbackOverride : config.enableFallback;

  // Build messages array
  let requestMessages = [];
  if (messages && messages.length > 0) {
    requestMessages = messages.map(message => ({ ...message }));
    if (systemPrompt && !requestMessages.some(m => m.role === 'system')) {
      requestMessages.unshift({ role: 'system', content: systemPrompt });
    }
  } else if (prompt) {
    if (systemPrompt) {
      requestMessages.push({ role: 'system', content: systemPrompt });
    }
    requestMessages.push({ role: 'user', content: prompt });
  }

  const requestId = randomUUID();
  const inputDecisions = [];
  for (let index = 0; index < requestMessages.length; index += 1) {
    const message = requestMessages[index];
    if (typeof message.content !== 'string') {
      const error = new Error('Structured LLM message content cannot be safely moderated');
      error.code = 'MODERATION_BLOCKED';
      error.stage = 'input';
      error.decision = 'BLOCK';
      throw error;
    }
    const inputCheck = await requestModeration('/api/v1/moderate', message.content, `${requestId}-input-${index}`);
    const inputDecision = assertModerationAllowed(inputCheck, 'input');
    inputDecisions.push(inputDecision);
    if (typeof inputCheck.sanitizedContent === 'string') {
      message.content = inputCheck.sanitizedContent;
    }
  }
  const sanitizedUserMessage = [...requestMessages].reverse().find(message => message.role === 'user');
  if (prompt && sanitizedUserMessage) prompt = sanitizedUserMessage.content;
  const sanitizedSystemMessage = requestMessages.find(message => message.role === 'system');
  if (sanitizedSystemMessage) systemPrompt = sanitizedSystemMessage.content;

  const startTime = Date.now();
  console.log(`\n================================================================`);
  console.log(`🤖 [LLM INVOCATION] Provider: [${primaryProvider.toUpperCase()}] | Model: [${primaryModel}]`);
  if (prompt) console.log(`📥 Prompt: "${prompt.substring(0, 120)}${prompt.length > 120 ? '...' : ''}"`);
  console.log(`================================================================`);

  try {
    const result = await executeProviderCall({
      provider: primaryProvider,
      model: primaryModel,
      messages: requestMessages,
      systemPrompt,
      temperature,
      maxTokens,
      apiKeyOverride: apiKey,
      baseUrlOverride: primaryBaseUrl
    });
    const moderatedResult = await moderateLLMOutput(result, requestId);

    const duration = Date.now() - startTime;
    console.log(`✅ [LLM COMPLETED] Provider: [${primaryProvider.toUpperCase()}] | Time: ${duration}ms | Tokens: ${moderatedResult.usage?.totalTokens || 0}\n`);

    const usageObj = moderatedResult.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      ...moderatedResult,
      tokens: {
        prompt: usageObj.promptTokens,
        completion: usageObj.completionTokens,
        total: usageObj.totalTokens
      },
      fallbackUsed: false,
      primaryProvider,
      primaryModel,
      moderation: {
        enabled: process.env.MODERATION_ENABLED !== 'false',
        requestId,
        inputDecisions,
        outputDecision: moderatedResult.moderation.outputDecision
      }
    };
  } catch (primaryError) {
    if (primaryError.code === 'MODERATION_UNAVAILABLE' || primaryError.code === 'MODERATION_BLOCKED') {
      throw primaryError;
    }
    console.error(`⚠️ Primary LLM [${primaryProvider}] failed:`, primaryError.message);

    // Check if fallback is eligible
    if (isFallbackEnabled) {
      const fallbackProvider = config.fallbackProvider || (primaryProvider === 'groq' ? 'gemini' : 'groq');
      const fallbackModel = config.fallbackModel || PROVIDER_PRESETS[fallbackProvider]?.defaultModel || 'gemini-1.5-flash';
      const fallbackBaseUrl = config.fallbackBaseUrl;

      // Don't fallback to the exact same provider and model
      const isSameTarget = fallbackProvider === primaryProvider && fallbackModel === primaryModel;
      
      if (!isSameTarget) {
        console.warn(`\n================================================================`);
        console.warn(`⚠️ [AUTOMATIC FALLBACK TRIGGERED]`);
        console.warn(`🔴 Primary Failed: [${primaryProvider.toUpperCase()}: ${primaryModel}]`);
        console.warn(`   Reason: ${primaryError.message.substring(0, 150)}`);
        console.warn(`🔄 Auto-Failover to Fallback Provider: [${fallbackProvider.toUpperCase()}] | Model: [${fallbackModel}]`);
        console.warn(`================================================================\n`);

        try {
          const fallbackStartTime = Date.now();
          const fallbackResult = await executeProviderCall({
            provider: fallbackProvider,
            model: fallbackModel,
            messages: requestMessages,
            systemPrompt,
            temperature,
            maxTokens,
            baseUrlOverride: fallbackBaseUrl
          });
          const moderatedFallbackResult = await moderateLLMOutput(fallbackResult, requestId);

          const fallbackDuration = Date.now() - fallbackStartTime;
          console.log(`✅ [FALLBACK COMPLETED] Provider: [${fallbackProvider.toUpperCase()}] | Time: ${fallbackDuration}ms | Tokens: ${moderatedFallbackResult.usage?.totalTokens || 0}\n`);

          const fbUsage = moderatedFallbackResult.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

          return {
            ...moderatedFallbackResult,
            tokens: {
              prompt: fbUsage.promptTokens,
              completion: fbUsage.completionTokens,
              total: fbUsage.totalTokens
            },
            fallbackUsed: true,
            primaryError: primaryError.message,
            primaryProvider,
            primaryModel,
            fallbackProvider,
            fallbackModel,
            moderation: {
              enabled: process.env.MODERATION_ENABLED !== 'false',
              requestId,
              inputDecisions,
              outputDecision: moderatedFallbackResult.moderation.outputDecision
            }
          };
        } catch (fallbackError) {
          if (fallbackError.code === 'MODERATION_UNAVAILABLE' || fallbackError.code === 'MODERATION_BLOCKED') {
            throw fallbackError;
          }
          console.error(`❌ Fallback LLM [${fallbackProvider}] also failed:`, fallbackError.message);
          throw new Error(`Both primary [${primaryProvider}: ${primaryError.message}] and fallback [${fallbackProvider}: ${fallbackError.message}] failed.`);
        }
      }
    }

    // Re-throw if fallback was disabled or not applicable
    throw primaryError;
  }
}

/**
 * Test Connection for a given provider and API key
 */
export async function testLLMConnection({
  provider,
  apiKey,
  model = null,
  baseUrl = null
}) {
  const p = (provider || 'groq').toLowerCase();
  const testModel = model || PROVIDER_PRESETS[p]?.defaultModel;

  try {
    const startTime = Date.now();
    const result = await executeProviderCall({
      provider: p,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
      temperature: 0.1,
      maxTokens: 10,
      apiKeyOverride: apiKey,
      baseUrlOverride: baseUrl
    });
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      provider: p,
      model: testModel,
      response: result.content.trim(),
      latencyMs: elapsed,
      message: `Connection successful to ${PROVIDER_PRESETS[p]?.name || p} (${elapsed}ms)`
    };
  } catch (error) {
    return {
      success: false,
      provider: p,
      model: testModel,
      error: error.message || 'Connection failed',
      message: `Failed to connect to ${PROVIDER_PRESETS[p]?.name || p}: ${error.message}`
    };
  }
}

/**
 * Parse LLM Reranking response cleanly
 */
export function parseRerankResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];

  // 1. Strip reasoning traces and markdown code blocks
  let cleaned = responseText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // 2. Try standard JSON.parse
  try {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const list = parsed.rankings || parsed.scores || parsed.results || (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    // Continue to regex extraction
  }

  // 3. Fallback Regex Extraction (index then score)
  const scores = [];
  const regex = /\{[^{}]*?(?:index|docIndex|id)[\"':\s]+(\d+)[^{}]*?(?:score|relevance|relevanceScore)[\"':\s]+(\d+(?:\.\d+)?)[^{}]*?\}/gi;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    scores.push({
      index: parseInt(match[1], 10),
      score: parseFloat(match[2])
    });
  }

  if (scores.length > 0) return scores;

  // Alternate regex (score then index)
  const regexAlt = /\{[^{}]*?(?:score|relevance|relevanceScore)[\"':\s]+(\d+(?:\.\d+)?)[^{}]*?(?:index|docIndex|id)[\"':\s]+(\d+)[^{}]*?\}/gi;
  while ((match = regexAlt.exec(cleaned)) !== null) {
    scores.push({
      index: parseInt(match[2], 10),
      score: parseFloat(match[1])
    });
  }

  return scores;
}

/**
 * Compute fallback lexical/semantic relevance score if LLM fails
 */
function computeFallbackRerankScores(query, documents) {
  const queryWords = (query || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  const qSet = new Set(queryWords);

  return documents.map((doc, idx) => {
    const title = (doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || '').toLowerCase();
    const desc = (doc.description || doc.testCaseDescription || doc.userStoryDescription || '').toLowerCase();
    const full = `${title} ${desc}`;

    let titleMatches = 0;
    let fullMatches = 0;
    qSet.forEach(w => {
      if (title.includes(w)) titleMatches++;
      if (full.includes(w)) fullMatches++;
    });

    const titleScore = qSet.size > 0 ? (titleMatches / qSet.size) : 0.5;
    const fullScore = qSet.size > 0 ? (fullMatches / qSet.size) : 0.5;
    const baseScore = doc.score || doc.vectorScore || doc.bm25Score || 0.5;

    const blended = (0.5 * titleScore) + (0.3 * fullScore) + (0.2 * Math.min(1, baseScore));
    const scoreVal = Math.min(Math.max(parseFloat(blended.toFixed(4)), 0.05), 0.99);

    return {
      ...doc,
      rerankScore: scoreVal,
      originalRank: doc.originalRank || idx + 1,
      newRank: idx + 1,
      rerankModel: 'Lexical-Semantic Fallback',
      rerankProvider: 'local-hybrid',
      fallbackUsed: true
    };
  }).sort((a, b) => b.rerankScore - a.rerankScore).map((d, i) => ({ ...d, newRank: i + 1 }));
}

/**
 * Semantic document reranking with multi-provider + fallback support
 */
export async function rerankDocuments(query, documents, topK = 10, options = {}) {
  try {
    if (!documents || documents.length === 0) {
      return [];
    }

    const cfg = getLLMConfig();
    const rerankProvider = (options.provider || cfg.rerank.provider || 'groq').toLowerCase().trim();
    let rerankModel = options.model || cfg.rerank.model || PROVIDER_PRESETS[rerankProvider]?.defaultModel || 'openai/gpt-oss-120b';

    // For Groq reranking, ensure non-reasoning direct JSON model
    if (rerankProvider === 'groq' && (rerankModel.includes('qwen') || rerankModel.includes('deepseek') || rerankModel.includes('llama-3.3-70b'))) {
      rerankModel = 'openai/gpt-oss-120b';
    }

    console.log(`\n================================================================`);
    console.log(`🔄 [SEMANTIC RERANKING]`);
    console.log(`🏷️ Provider: [${rerankProvider.toUpperCase()}] | Model: [${rerankModel}]`);
    console.log(`🔍 Query: "${query}" | Evaluating Candidates: ${documents.length}`);
    console.log(`================================================================`);

    // In token optimization mode, evaluate up to top 20 candidates for fast LLM response
    const candidatesToScore = documents.slice(0, 20);

    const docTexts = candidatesToScore.map((doc, idx) => {
      const text = formatDocumentForRerank(doc);
      return `[${idx}] ${text}`;
    }).join('\n\n');

    const prompt = `You are an expert relevance scoring assistant. Score each document's relevance to the search query on a scale of 0-100.
High scores (80-100) are for directly matching, highly relevant test cases.
Moderate scores (50-79) are for related topics or partial matches.
Low scores (0-49) are for irrelevant documents.

Query: "${query}"

Documents:
${docTexts}

Return ONLY a valid JSON object with this exact structure - no other text or explanation:
{"rankings": [{"index": 0, "score": 95}, {"index": 1, "score": 87}]}

Sort by score highest first.`;

    const systemPrompt = "You are a JSON response assistant. Return ONLY valid JSON containing the rankings array, no markdown and no extra text.";

    let completion;
    try {
      completion = await chatCompletion({
        provider: rerankProvider,
        model: rerankModel,
        systemPrompt,
        prompt,
        temperature: 0.0,
        maxTokens: 1000
      });
    } catch (apiError) {
      console.warn('⚠️ Reranking API error, applying intelligent fallback:', apiError.message);
      return computeFallbackRerankScores(query, documents).slice(0, topK);
    }

    const responseText = completion?.content || '';
    if (!responseText) {
      return computeFallbackRerankScores(query, documents).slice(0, topK);
    }

    // Parse JSON rankings
    const scores = parseRerankResponse(responseText);

    if (!scores || scores.length === 0) {
      console.warn('⚠️ Could not parse rerank scores from LLM, using fallback relevance scoring');
      return computeFallbackRerankScores(query, documents).slice(0, topK);
    }

    const scoredIndices = new Set();
    const rerankedDocs = [];

    for (const item of scores) {
      if (!item) continue;
      const idx = typeof item.index === 'number' ? item.index : parseInt(item.index ?? item.docIndex ?? item.id, 10);
      const scoreVal = typeof item.score === 'number' ? item.score : parseFloat(item.score ?? item.relevance ?? item.relevanceScore ?? 50);

      if (!isNaN(idx) && idx >= 0 && idx < candidatesToScore.length && !scoredIndices.has(idx)) {
        scoredIndices.add(idx);
        const origDoc = candidatesToScore[idx];
        rerankedDocs.push({
          ...origDoc,
          rerankScore: Math.min(Math.max((isNaN(scoreVal) ? 50 : scoreVal) / 100, 0.01), 1.0),
          originalRank: origDoc.originalRank || (idx + 1),
          rerankModel: completion.model || rerankModel,
          rerankProvider: completion.provider || rerankProvider,
          fallbackUsed: completion.fallbackUsed || false
        });
      }
    }

    // Include any remaining unscored candidates
    candidatesToScore.forEach((doc, idx) => {
      if (!scoredIndices.has(idx)) {
        rerankedDocs.push({
          ...doc,
          rerankScore: parseFloat((doc.score || doc.vectorScore || 0.4).toFixed(4)),
          originalRank: doc.originalRank || (idx + 1),
          rerankModel: completion.model || rerankModel,
          rerankProvider: completion.provider || rerankProvider,
          fallbackUsed: completion.fallbackUsed || false
        });
      }
    });

    // Sort by rerankScore descending and assign newRank
    rerankedDocs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
    const finalReranked = rerankedDocs.map((doc, rankIdx) => ({
      ...doc,
      newRank: rankIdx + 1
    })).slice(0, topK);

    console.log(`✅ [SEMANTIC RERANKING COMPLETED] Top-${finalReranked.length} documents scored & re-ordered successfully\n`);
    return finalReranked;
  } catch (error) {
    console.error('⚠️ Reranking error:', error.message);
    return computeFallbackRerankScores(query, documents).slice(0, topK);
  }
}

/**
 * Summarize search results using configured LLM + fallback
 */
export async function summarizeResults(query, documents, options = {}) {
  try {
    const {
      maxLength = 500,
      style = 'concise',
      includeMetrics = false,
      provider: requestedProvider,
      model: requestedModel
    } = options;

    if (!documents || documents.length === 0) {
      return 'No results found.';
    }

    const cfg = getLLMConfig();
    const sumProvider = (requestedProvider || cfg.summarization.provider || 'groq').toLowerCase().trim();
    const sumModel = requestedModel || cfg.summarization.model || PROVIDER_PRESETS[sumProvider]?.defaultModel || 'openai/gpt-oss-120b';

    console.log(`\n================================================================`);
    console.log(`📝 [SUMMARIZATION & DEDUPLICATION]`);
    console.log(`🏷️ Provider: [${sumProvider.toUpperCase()}] | Model: [${sumModel}]`);
    console.log(`🔍 Query: "${query}" | Style: ${style} | Input Documents: ${documents.length}`);
    console.log(`================================================================`);

    // In token optimization mode, cap the input documents to top 8 to save prompt tokens
    const maxDocs = cfg.enableTokenOptimization ? Math.min(documents.length, 8) : documents.length;
    const docsToSummarize = documents.slice(0, maxDocs);

    const docTexts = docsToSummarize.map((doc, idx) => `${idx + 1}. ${formatDocumentForSummary(doc)}`).join('\n\n');

    let styleInstruction = '';
    if (style === 'bullet') {
      styleInstruction = 'Provide a bullet-point summary with key findings.';
    } else if (style === 'detailed') {
      styleInstruction = 'Provide a detailed analysis of the search results.';
    } else {
      styleInstruction = 'Provide a concise overview of the search results.';
    }

    const prompt = `You are a helpful assistant that summarizes search results.

Query: "${query}"

Search Results:
${docTexts}

Task: ${styleInstruction}
${includeMetrics ? 'Include statistics like number of results, common themes, and relevance insights.' : ''}
Keep the summary under ${maxLength} words.

Summary:`;

    const systemPrompt = "You are a helpful assistant that provides clear, accurate summaries of search results.";

    const maxSummaryTokens = options.maxTokens || cfg.maxSummaryTokens || Math.min(maxLength * 2, 500);

    const result = await chatCompletion({
      provider: sumProvider,
      model: sumModel,
      systemPrompt,
      prompt,
      temperature: 0.3,
      maxTokens: maxSummaryTokens
    });

    const cleanSummary = (result.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    console.log(`✅ [SUMMARIZATION COMPLETED] Summary generated (${cleanSummary.length} chars)\n`);
    return cleanSummary;
  } catch (error) {
    console.error('❌ Summarization error:', error.message);
    return `Error generating summary: ${error.message}`;
  }
}

/**
 * Generate answer based on retrieved documents
 */
export async function generateAnswer(query, documents, options = {}) {
  try {
    const {
      maxTokens = 1000,
      includeReferences = true,
      temperature = 0.2
    } = options;

    if (!documents || documents.length === 0) {
      return {
        answer: "I couldn't find relevant information to answer your question.",
        references: [],
        confidence: 0
      };
    }

    const context = documents.map((doc, idx) => `[${idx + 1}] ${formatDocumentForSummary(doc)}`).join('\n\n');

    const prompt = `Answer the following question based ONLY on the provided context. If the answer cannot be found in the context, say so.

Context:
${context}

Question: ${query}

Instructions:
1. Provide a direct, accurate answer based on the context
2. ${includeReferences ? 'Cite source numbers [1], [2], etc. when referencing specific information' : 'Do not include citations'}
3. Be concise but complete
4. If uncertain or if information is not in context, acknowledge it

Answer:`;

    const systemPrompt = "You are a helpful assistant that answers questions accurately based on provided context. Never make up information.";

    const result = await chatCompletion({
      systemPrompt,
      prompt,
      temperature,
      maxTokens
    });

    const answer = result.content.trim();
    const references = [];

    if (includeReferences) {
      const refMatches = answer.matchAll(/\[(\d+)\]/g);
      const refIndices = new Set([...refMatches].map(m => parseInt(m[1]) - 1));
      refIndices.forEach(idx => {
        if (idx >= 0 && idx < documents.length) {
          references.push({ index: idx + 1, document: documents[idx] });
        }
      });
    }

    return {
      answer,
      references,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed || false,
      tokensUsed: result.usage?.totalTokens || 0
    };
  } catch (error) {
    console.error('❌ Answer generation error:', error.message);
    return {
      answer: `Error generating answer: ${error.message}`,
      references: [],
      confidence: 0
    };
  }
}

// Helpers
function formatDocumentForRerank(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const id = doc.id || doc.testCaseId || doc.testcase_id || doc.userStoryId || doc.storyId || doc.key || (doc._id ? String(doc._id) : '');
  const title = doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || doc.summary || '';
  const description = doc.description || doc.testCaseDescription || doc.userStoryDescription || doc.storyDescription || doc.acceptanceCriteria || '';
  const module = doc.module || doc.category || '';
  const priority = doc.priority || '';
  return `ID: ${id} | Title: ${title}${module ? ` | Module: ${module}` : ''}${priority ? ` | Priority: ${priority}` : ''} | Description: ${description.substring(0, 300)}`;
}

function formatDocumentForSummary(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const id = doc.id || doc.testCaseId || doc.testcase_id || doc.userStoryId || doc.storyId || doc.key || (doc._id ? String(doc._id) : '');
  const title = doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || doc.summary || 'N/A';
  const description = doc.description || doc.testCaseDescription || doc.userStoryDescription || doc.storyDescription || doc.acceptanceCriteria || '';
  const parts = [
    `ID: ${id}`,
    `Title: ${title}`,
    doc.module ? `Module: ${doc.module}` : null,
    description ? `Description: ${description.substring(0, 150)}` : null,
    doc.score ? `Relevance: ${(doc.score * 100).toFixed(1)}%` : null
  ].filter(Boolean);
  return parts.join(' | ');
}

export function extractAllTestCases(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const getField = (blockStr, name) => {
    const reg = new RegExp(`"${name}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*})`);
    const m = blockStr.match(reg);
    return m ? m[1].replace(/\\r\\n/g, '\n').replace(/\\"/g, '"') : null;
  };

  const getArrayField = (blockStr, name) => {
    const reg = new RegExp(`"${name}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const m = blockStr.match(reg);
    if (!m) return [];
    try {
      return JSON.parse(`[${m[1]}]`);
    } catch (e) {
      return m[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    }
  };

  const tcMarker = rawText.indexOf('"newTestCases"');
  const targetText = tcMarker !== -1 ? rawText.substring(tcMarker) : rawText;

  const tcBlocks = [];
  const regex = /\{\s*"testCaseId"\s*:\s*"([^"]+)"([\s\S]*?)(?=\s*,\s*\{\s*"testCaseId"|\s*\]\s*,|\s*\]\s*\}|\s*\]|$)/g;

  let match;
  while ((match = regex.exec(targetText)) !== null) {
    const fullBlock = match[0];
    try {
      let clean = fullBlock.trim();
      if (!clean.endsWith('}')) clean += '}';
      const parsed = JSON.parse(clean);
      if (parsed.testCaseTitle || parsed.title || parsed.testCaseDescription) {
        tcBlocks.push({
          testCaseId: parsed.testCaseId,
          module: parsed.module || 'General',
          testCaseTitle: parsed.testCaseTitle || parsed.title || 'Untitled Test Case',
          testCaseDescription: parsed.testCaseDescription || '',
          preconditions: parsed.preconditions || '',
          testSteps: parsed.testSteps || '',
          expectedResults: parsed.expectedResults || '',
          priority: parsed.priority || 'P2',
          testType: parsed.testType || 'Functional',
          riskLevel: parsed.riskLevel || 'Medium',
          linkedUserStories: parsed.linkedUserStories || [],
          sourceCitations: parsed.sourceCitations || [],
          complianceNotes: parsed.complianceNotes || '',
          estimatedExecutionTime: parsed.estimatedExecutionTime || ''
        });
        continue;
      }
    } catch (e) {}

    // Robust field extraction fallback
    const title = getField(fullBlock, 'testCaseTitle') || getField(fullBlock, 'title');
    if (title) {
      tcBlocks.push({
        testCaseId: getField(fullBlock, 'testCaseId') || match[1] || 'TC_GEN',
        module: getField(fullBlock, 'module') || 'General',
        testCaseTitle: title,
        testCaseDescription: getField(fullBlock, 'testCaseDescription') || getField(fullBlock, 'description') || '',
        preconditions: getField(fullBlock, 'preconditions') || getField(fullBlock, 'precondition') || '',
        testSteps: getField(fullBlock, 'testSteps') || getField(fullBlock, 'steps') || '',
        expectedResults: getField(fullBlock, 'expectedResults') || getField(fullBlock, 'expectedResult') || '',
        priority: getField(fullBlock, 'priority') || 'P2',
        testType: getField(fullBlock, 'testType') || 'Functional',
        riskLevel: getField(fullBlock, 'riskLevel') || 'Medium',
        linkedUserStories: getArrayField(fullBlock, 'linkedUserStories'),
        sourceCitations: getArrayField(fullBlock, 'sourceCitations'),
        complianceNotes: getField(fullBlock, 'complianceNotes') || '',
        estimatedExecutionTime: getField(fullBlock, 'estimatedExecutionTime') || ''
      });
    }
  }

  return tcBlocks;
}

export function parseAndRepairLlmOutput(raw) {
  if (!raw) return { newTestCases: [] };
  if (typeof raw === 'object') {
    if (raw.newTestCases && Array.isArray(raw.newTestCases) && raw.newTestCases.length > 0) return raw;
    if (raw.testCases && Array.isArray(raw.testCases)) return { ...raw, newTestCases: raw.testCases };
    if (Array.isArray(raw)) return { newTestCases: raw };
    if (raw.overallVerdict || raw.dimensionScores || raw.keyDifferences || raw.learnerTakeaways) return raw;
    if (raw.raw && typeof raw.raw === 'string') raw = raw.raw;
  }

  let text = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fence) {
    text = fence[1].trim();
  }

  // 1. Direct JSON.parse
  try {
    const direct = JSON.parse(text);
    if (direct) {
      if (direct.newTestCases || direct.testCases || Array.isArray(direct)) {
        return {
          analysis: direct.analysis || {},
          newTestCases: direct.newTestCases || direct.testCases || (Array.isArray(direct) ? direct : []),
          rationale: direct.rationale || [],
          recommendations: direct.recommendations || ''
        };
      }
      if (direct.overallVerdict || direct.dimensionScores || direct.keyDifferences || direct.learnerTakeaways) {
        return direct;
      }
      if (typeof direct === 'object' && Object.keys(direct).length > 0) {
        return direct;
      }
    }
  } catch (e) {}

  // 2. Intelligent JSON balance & auto-repair
  try {
    let inString = false;
    let escape = false;
    const stack = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === ch) {
            stack.pop();
          }
        }
      }
    }

    let balanced = text.trim();
    if (inString) balanced += '"';
    balanced = balanced.replace(/,\s*$/, '');
    while (stack.length > 0) {
      balanced += stack.pop();
    }

    const parsed = JSON.parse(balanced);
    if (parsed) {
      if (parsed.newTestCases || parsed.testCases || Array.isArray(parsed)) {
        return {
          analysis: parsed.analysis || {},
          newTestCases: parsed.newTestCases || parsed.testCases || (Array.isArray(parsed) ? parsed : []),
          rationale: parsed.rationale || [],
          recommendations: parsed.recommendations || ''
        };
      }
      if (parsed.overallVerdict || parsed.dimensionScores || parsed.keyDifferences || parsed.learnerTakeaways) {
        return parsed;
      }
      if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  // 3. Fallback: Check for comparison structure
  try {
    const verdictMatch = text.match(/"overallVerdict"\s*:\s*\{([\s\S]*?)\}/);
    if (verdictMatch) {
      const parsedObj = {};
      parsedObj.overallVerdict = JSON.parse(`{${verdictMatch[1]}}`);
      const dimMatch = text.match(/"dimensionScores"\s*:\s*\[([\s\S]*?)\]/);
      if (dimMatch) {
        parsedObj.dimensionScores = JSON.parse(`[${dimMatch[1]}]`);
      }
      const keyDiffMatch = text.match(/"keyDifferences"\s*:\s*\[([\s\S]*?)\]/);
      if (keyDiffMatch) {
        parsedObj.keyDifferences = JSON.parse(`[${keyDiffMatch[1]}]`);
      }
      const takeMatch = text.match(/"learnerTakeaways"\s*:\s*\[([\s\S]*?)\]/);
      if (takeMatch) {
        parsedObj.learnerTakeaways = JSON.parse(`[${takeMatch[1]}]`);
      }
      return parsedObj;
    }
  } catch (e) {}

  // 4. Fallback: Robust block extraction
  const extractedCases = extractAllTestCases(text);
  let analysis = {};
  const analysisMatch = text.match(/"analysis"\s*:\s*\{([\s\S]*?)\}/);
  if (analysisMatch) {
    try {
      analysis = JSON.parse(`{${analysisMatch[1]}}`);
    } catch (e) {}
  }

  return {
    analysis,
    newTestCases: extractedCases,
    rationale: [],
    recommendations: ''
  };
}

export function extractJsonObject(text) {
  if (!text) return null;
  const repaired = parseAndRepairLlmOutput(text);
  if (repaired && repaired.newTestCases && repaired.newTestCases.length > 0) {
    return repaired;
  }
  return null;
}

export default {
  PROVIDER_PRESETS,
  getLLMConfig,
  getApiKeyForProvider,
  chatCompletion,
  rerankDocuments,
  summarizeResults,
  generateAnswer,
  testLLMConnection,
  parseAndRepairLlmOutput,
  extractAllTestCases
};

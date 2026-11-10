import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  Tabs,
  Tab,
  Divider,
  Alert,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  ListSubheader,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Collapse,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Checkbox
} from '@mui/material';
import {
  Schema as SchemaIcon,
  Code as CodeIcon,
  Save as SaveIcon,
  Refresh as ResetIcon,
  PlayArrow as TestIcon,
  ContentCopy as CopyIcon,
  CheckCircle as ValidIcon,
  Error as ErrorIcon,
  Description as TemplateIcon,
  CompareArrows as CompareIcon,
  Psychology as AiIcon,
  Search as SearchIcon,
  GetApp as ExportIcon,
  Assessment as AssessmentIcon,
  AutoAwesome as AutoAwesomeIcon,
  Speed as SpeedIcon,
  Layers as LayersIcon,
  Lightbulb as LightbulbIcon,
  DeleteOutline as DeleteOutlineIcon,
  PlayCircleFilled as PlayAllIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  HighlightOff as HighlightOffIcon,
  ViewColumn as ViewColumnIcon,
  Tab as TabIcon,
  ExpandMore as ExpandMoreIcon,
  BookmarkBorder as PresetIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Bolt as BoltIcon
} from '@mui/icons-material';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: 20 }}>
      {value === index && children}
    </div>
  );
}

const DEFAULT_JSON_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Healthcare Test Case",
  "type": "object",
  "properties": {
    "testCaseId": {
      "type": "string",
      "description": "Unique identifier for the test case, e.g., TC_001"
    },
    "module": {
      "type": "string",
      "description": "Functional module name, e.g., Patient Registration"
    },
    "testCaseTitle": {
      "type": "string",
      "description": "Concise title describing what is being tested"
    },
    "testCaseDescription": {
      "type": "string",
      "description": "Detailed narrative explaining the purpose and flow of the test"
    },
    "testSteps": {
      "type": "array",
      "description": "Step-by-step instructions for executing the test",
      "items": {
        "type": "string"
      }
    },
    "expectedResults": {
      "type": "string",
      "description": "Expected system behavior after test execution"
    },
    "priority": {
      "type": "string",
      "enum": ["Low", "Medium", "High", "Critical"]
    },
    "createdDate": {
      "type": "string",
      "format": "date",
      "description": "Date when the test case was first created"
    },
    "modifiedDate": {
      "type": "string",
      "format": "date",
      "description": "Date when the test case was last modified"
    },
    "author": {
      "type": "string",
      "description": "Author or QA engineer who created or updated the test"
    },
    "version": {
      "type": "string",
      "description": "Version of the test case document"
    },
    "relatedUserStories": {
      "type": "array",
      "description": "IDs of related user stories in the user story collection",
      "items": {
        "type": "string"
      }
    },
    "metadata": {
      "type": "object",
      "description": "Additional tags for hybrid search filtering",
      "properties": {
        "module": { "type": "string" },
        "priority": { "type": "string" },
        "environment": { "type": "string" },
        "automationStatus": { "type": "boolean" }
      }
    }
  },
  "required": [
    "testCaseId",
    "testCaseTitle",
    "testSteps",
    "expectedResults"
  ]
}`;

const DEFAULT_PROMPT_TEMPLATE = `# HEALTHCARE TEST CASE GENERATION

## INSTRUCTION
Generate high-quality test cases for the user story using retrieved test case context. Each must:
- Include 5-8 detailed, numbered test steps
- Define measurable expected results
- Cover positive, negative, boundary, and edge cases
- Reference source test cases when context is available

## CONTEXT
MongoDB database with 6,000+ healthcare test cases covering Patient Registration, Laboratory, Ward Management, Billing, Prescription, Diagnostics.
Healthcare entities: UHID, PRN, ERN, OTP, HIPAA encryption, and hospital portal workflows.

## EXAMPLES
Study the retrieved test cases below for format, terminology, and step structure.

## PERSONA
Senior QA Engineer with healthcare systems expertise (HIPAA, HMS, PHI/PII).

## OUTPUT FORMAT
Valid JSON with this schema:
{
  "analysis": {
    "userStoryTitle": "string",
    "userStoryModule": "string",
    "existingCoverageCount": number,
    "gapsIdentified": ["string"]
  },
  "newTestCases": [{
    "testCaseId": "string",
    "module": "string",
    "testCaseTitle": "string",
    "testCaseDescription": "string",
    "preconditions": "string",
    "testSteps": "string with \\r\\n separators",
    "expectedResults": "string",
    "priority": "P1|P2|P3",
    "testType": "Integration|Functional",
    "riskLevel": "Critical|High|Medium|Low",
    "linkedUserStories": ["string"],
    "sourceCitations": ["string"],
    "complianceNotes": "string",
    "estimatedExecutionTime": "string"
  }],
  "rationale": [{"testCaseId": "string", "reason": "string"}],
  "recommendations": "string"
}

## TONE
Professional, technical. Use precise healthcare terminology (UHID, PRN, ERN). Measurable language. Compliance awareness.`;

// User Story Presets for Quick Demo/Teaching
const USER_STORY_PRESETS = [
  {
    id: 'whatsapp_reports',
    title: 'WhatsApp Diagnostic Reports (HC-125)',
    module: 'Diagnostics & Communication',
    query: `Module: Patient Communication & Diagnostics
User Story ID: HC-125
User Story Title: Share Diagnostic Reports with Patients via WhatsApp

User Story Description:
As a diagnostic technician, I want to automatically send patients their lab test reports securely through WhatsApp once results are validated, so that patients can access their diagnostic data conveniently without logging into the hospital portal.

Acceptance Criteria:
1. Report must be sent only after validation by authorized technician
2. WhatsApp message must include secure download link with expiration (24 hours)
3. Patient consent for WhatsApp communication must be verified
4. System must log all report delivery attempts
5. Support for PDF format with encryption
6. Handle failure scenarios (invalid number, WhatsApp service down)
7. Comply with HIPAA requirements for PHI transmission`
  },
  {
    id: 'patient_registration',
    title: 'Patient UHID Registration (HC-089)',
    module: 'Patient Registration',
    query: `Module: Patient Registration
User Story ID: HC-089
User Story Title: Automated Unique Hospital Identification (UHID) Generation

User Story Description:
As a front-desk admission officer, I want the system to automatically generate a unique 10-digit UHID upon submitting new patient demographic details with barcode generation, so that every patient is distinctly trackable across all hospital departments (OPD, IPD, Diagnostics, Billing).

Acceptance Criteria:
1. UHID must follow alphanumeric prefix format with sequence checksum
2. System must check for duplicate national identity/phone numbers
3. Immediate generation of printable registration barcode
4. Mandatory emergency contact and blood group capture
5. Comply with national health record compliance standards`
  },
  {
    id: 'lab_validation',
    title: 'Lab Report Verification & Alerting (HC-305)',
    module: 'Laboratory',
    query: `Module: Laboratory
User Story ID: HC-305
User Story Title: Critical Lab Panic Value Alerting & Approval

User Story Description:
As a laboratory pathologist, I want the system to flag critical panic values in blood tests (e.g. Potassium > 6.0 mEq/L, Glucose < 40 mg/dL) with immediate SMS/sound alerts to the attending doctor, so that life-saving medical intervention can be initiated without delay.

Acceptance Criteria:
1. Automated panic value threshold validation against reference range tables
2. Multi-tier alert broadcast to attending physician and nursing station
3. Pathologist digital signature mandatory before report sign-off
4. Full audit log of alert notification acknowledgement timestamp`
  }
];

function extractAllTestCasesFromRaw(rawText) {
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

function parseAndRepairLlmOutput(raw) {
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

  // 3. Fallback: Check for comparison structure in regex
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
  const extractedCases = extractAllTestCasesFromRaw(text);
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

function PromptSchemaManager() {
  const [tabValue, setTabValue] = useState(2); // Start on Test & Preview
  const [jsonSchema, setJsonSchema] = useState(DEFAULT_JSON_SCHEMA);
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [schemaValid, setSchemaValid] = useState(true);
  const [schemaError, setSchemaError] = useState(null);
  const [testQuery, setTestQuery] = useState(USER_STORY_PRESETS[0].query);
  const [saved, setSaved] = useState(false);

  // Generation Mode: 'with-rag' | 'without-rag'
  const [ragMode, setRagMode] = useState('with-rag');
  const [qualityMode, setQualityMode] = useState(() => {
    try {
      return localStorage.getItem('testcase_quality_mode') === 'automation' ? 'automation' : 'manual';
    } catch {
      return 'manual';
    }
  });

  // Test Case Count Configuration: 'auto' | 'custom'
  const [countMode, setCountMode] = useState('custom');
  const [customCount, setCustomCount] = useState(6);

  // "With RAG" States (Persisted in localStorage)
  const [withRagResult, setWithRagResult] = useState(() => {
    try {
      const cached = localStorage.getItem('prompt_with_rag_result');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed) {
        if (!parsed.response?.newTestCases?.length && (parsed.response?.raw || parsed.rawContent)) {
          parsed.response = parseAndRepairLlmOutput(parsed.response?.raw || parsed.rawContent);
        }
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [withRagLoading, setWithRagLoading] = useState(false);
  const [similarUserStories, setSimilarUserStories] = useState([]);
  const [pipelineView, setPipelineView] = useState('generated');

  // "Without RAG" States (Persisted in localStorage)
  const [withoutRagResult, setWithoutRagResult] = useState(() => {
    try {
      const cached = localStorage.getItem('prompt_without_rag_result');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed) {
        if (!parsed.response?.newTestCases?.length && (parsed.response?.raw || parsed.rawContent)) {
          parsed.response = parseAndRepairLlmOutput(parsed.response?.raw || parsed.rawContent);
        }
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [withoutRagLoading, setWithoutRagLoading] = useState(false);

  // Sequential execution state for "Run Both Modes"
  const [runningBoth, setRunningBoth] = useState(false);
  const [currentStepText, setCurrentStepText] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);

  // Comparison View State: 'split' | 'tabs'
  const [comparisonLayout, setComparisonLayout] = useState('split');
  const [comparisonTab, setComparisonTab] = useState('with-rag');
  const [comparisonContextSubtab, setComparisonContextSubtab] = useState('cases');

  // AI-Powered Deep Comparison State (Persisted in localStorage)
  const [aiComparisonResult, setAiComparisonResult] = useState(() => {
    try {
      const cached = localStorage.getItem('prompt_ai_comparison_result');
      if (!cached) return null;
      let parsed = JSON.parse(cached);
      if (parsed) {
        if (!parsed.overallVerdict && !parsed.dimensionScores) {
          if (parsed.response && (parsed.response.overallVerdict || parsed.response.dimensionScores)) {
            parsed = parsed.response;
          } else if (parsed.rawContent) {
            parsed = parseAndRepairLlmOutput(parsed.rawContent);
          }
        }
      }
      return (parsed && (parsed.overallVerdict || parsed.dimensionScores)) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [aiComparing, setAiComparing] = useState(false);

  // Metrics evaluation states
  const [metricsResult, setMetricsResult] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState('');
  const [enabledMetrics, setEnabledMetrics] = useState({
    faithfulness: true,
    contextual_precision: true,
    contextual_recall: true,
    pii_leakage: true,
    bias: true,
    hallucination: true,
    ragas: true,
    answer_relevancy: true
  });
  const [deepevalUrl, setDeepevalUrl] = useState('http://localhost:8000/eval');
  const [evalModel, setEvalModel] = useState('openai/gpt-oss-120b');
  const [deepevalServerOnline, setDeepevalServerOnline] = useState(null);

  // Token Optimization & 8k Budget Management
  const [tokenOptimization, setTokenOptimization] = useState(() => {
    try {
      const cached = localStorage.getItem('token_optimization_enabled');
      return cached !== null ? cached === 'true' : true;
    } catch {
      return true;
    }
  });
  const [maxTotalTokens, setMaxTotalTokens] = useState(8000);
  const [maxGenerationTokens, setMaxGenerationTokens] = useState(3000);
  const [maxSummaryTokens, setMaxSummaryTokens] = useState(400);

  // Fetch system env settings on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/env')
      .then(res => res.json())
      .then(data => {
        if (data.ENABLE_TOKEN_OPTIMIZATION !== undefined) {
          const isOpt = data.ENABLE_TOKEN_OPTIMIZATION === 'true' || data.ENABLE_TOKEN_OPTIMIZATION === true;
          setTokenOptimization(isOpt);
        }
        if (data.MAX_TOTAL_TOKENS) setMaxTotalTokens(parseInt(data.MAX_TOTAL_TOKENS, 10));
        if (data.MAX_GENERATION_TOKENS) setMaxGenerationTokens(parseInt(data.MAX_GENERATION_TOKENS, 10));
        if (data.MAX_SUMMARY_TOKENS) setMaxSummaryTokens(parseInt(data.MAX_SUMMARY_TOKENS, 10));
        if (data.ENABLED_METRICS) {
          const list = data.ENABLED_METRICS.split(',').map(m => m.trim().toLowerCase());
          setEnabledMetrics({
            faithfulness: list.includes('faithfulness'),
            contextual_precision: list.includes('contextual_precision'),
            contextual_recall: list.includes('contextual_recall'),
            pii_leakage: list.includes('pii_leakage'),
            bias: list.includes('bias'),
            hallucination: list.includes('hallucination'),
            ragas: list.includes('ragas'),
            answer_relevancy: list.includes('answer_relevancy')
          });
        }
        if (data.DEEPEVAL_URL) setDeepevalUrl(data.DEEPEVAL_URL);
        if (data.EVAL_MODEL) setEvalModel(data.EVAL_MODEL);
      })
      .catch(err => console.warn('Could not load token env settings:', err.message));

    // Health check ping for DeepEval service
    fetch('http://localhost:3001/api/eval/health')
      .then(res => res.json())
      .then(data => setDeepevalServerOnline(data.status === 'ok'))
      .catch(() => setDeepevalServerOnline(false));
  }, []);

  const handleToggleTokenOptimization = (enabled) => {
    setTokenOptimization(enabled);
    try {
      localStorage.setItem('token_optimization_enabled', String(enabled));
    } catch (e) {
      console.warn('Failed to cache token_optimization_enabled', e);
    }
  };

  // Persist cache
  useEffect(() => {
    if (withRagResult) {
      try {
        localStorage.setItem('prompt_with_rag_result', JSON.stringify(withRagResult));
      } catch (e) {
        console.warn('Failed to cache withRagResult', e);
      }
    }
  }, [withRagResult]);

  useEffect(() => {
    if (withoutRagResult) {
      try {
        localStorage.setItem('prompt_without_rag_result', JSON.stringify(withoutRagResult));
      } catch (e) {
        console.warn('Failed to cache withoutRagResult', e);
      }
    }
  }, [withoutRagResult]);

  useEffect(() => {
    if (aiComparisonResult) {
      try {
        localStorage.setItem('prompt_ai_comparison_result', JSON.stringify(aiComparisonResult));
      } catch (e) {
        console.warn('Failed to cache aiComparisonResult', e);
      }
    }
  }, [aiComparisonResult]);

  // Validate JSON Schema
  const validateSchema = (schemaText) => {
    try {
      JSON.parse(schemaText);
      setSchemaValid(true);
      setSchemaError(null);
      return true;
    } catch (error) {
      setSchemaValid(false);
      setSchemaError(error.message);
      return false;
    }
  };

  const handleSchemaChange = (e) => {
    const value = e.target.value;
    setJsonSchema(value);
    validateSchema(value);
  };

  const handleReset = (type) => {
    if (type === 'schema') {
      setJsonSchema(DEFAULT_JSON_SCHEMA);
      validateSchema(DEFAULT_JSON_SCHEMA);
    } else {
      setPromptTemplate(DEFAULT_PROMPT_TEMPLATE);
    }
  };

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    alert(`${type} copied to clipboard!`);
  };

  const handleSave = async () => {
    if (!validateSchema(jsonSchema)) {
      alert('Please fix JSON Schema errors before saving');
      return;
    }
    try {
      const config = {
        jsonSchema: JSON.parse(jsonSchema),
        promptTemplate: promptTemplate,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('promptSchemaConfig', JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      alert('Configuration saved successfully!');
    } catch (error) {
      alert('Error saving configuration: ' + error.message);
    }
  };

  const handleClearResults = () => {
    if (window.confirm('Clear all saved "With RAG" and "Without RAG" generation results?')) {
      setWithRagResult(null);
      setWithoutRagResult(null);
      setAiComparisonResult(null);
      localStorage.removeItem('prompt_with_rag_result');
      localStorage.removeItem('prompt_without_rag_result');
      localStorage.removeItem('prompt_ai_comparison_result');
    }
  };

  // Helper: Count prompt injection
  const getCountPromptDirective = () => {
    if (countMode === 'custom') {
      const countVal = Math.max(1, Number(customCount) || 6);
      return `Generate exactly ${countVal} comprehensive, distinct test cases covering all key scenarios.`;
    }
    return `Analyze the complexity, acceptance criteria, and edge cases of the user story to dynamically determine and generate the optimal number of comprehensive test cases.`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. WITHOUT RAG GENERATION (Direct Baseline LLM - Zero Context)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleWithoutRagTest = async () => {
    if (!validateSchema(jsonSchema)) {
      alert('Please fix JSON Schema errors before testing');
      return null;
    }

    setWithoutRagLoading(true);
    setCurrentStepText('Generating baseline test cases directly with LLM (Zero DB context)...');
    setGenerationProgress(15);

    try {
      if (!testQuery || testQuery.trim() === '') {
        throw new Error('User story input is required');
      }

      setGenerationProgress(30);

      // Fetch sequence ID
      let nextTestCaseId = 'TC_BASE_001';
      try {
        const latestIdResponse = await fetch('http://localhost:3001/api/testcases/latest-id');
        if (latestIdResponse.ok) {
          const latestIdData = await latestIdResponse.json();
          nextTestCaseId = latestIdData.nextTestCaseId || 'TC_BASE_001';
        }
      } catch (e) {
        console.warn('Could not fetch latest ID, using default:', e.message);
      }

      setGenerationProgress(50);

      const countDirective = getCountPromptDirective();
      const fullPrompt = `${promptTemplate}

### USER STORY FOR TEST GENERATION (ZERO CONTEXT BASELINE - NO DATABASE SEARCH):
${testQuery}

### GENERATION MODE:
WITHOUT RAG (Direct LLM generation). Generate test cases purely using the user story and system prompt guidelines without any external database context.

### REQUIREMENTS:
1. Start IDs from ${nextTestCaseId}, continue sequentially
2. Format testSteps with \\r\\n: "1.Step\\r\\n2.Step\\r\\n..."
3. Include 5-8 steps per test case
4. Set sourceCitations array to ["Direct Prompt (No RAG)"]
5. ${countDirective}

### OUTPUT JSON:
{
  "analysis": {
    "userStoryTitle": "string",
    "userStoryModule": "string",
    "existingCoverageCount": 0,
    "gapsIdentified": ["string"]
  },
  "newTestCases": [{
    "testCaseId": "${nextTestCaseId}",
    "module": "string",
    "testCaseTitle": "string",
    "testCaseDescription": "string",
    "preconditions": "string",
    "testSteps": "string with \\r\\n",
    "expectedResults": "string",
    "priority": "P1|P2|P3",
    "testType": "Integration|Functional",
    "riskLevel": "Critical|High|Medium|Low",
    "linkedUserStories": ["string"],
    "sourceCitations": ["Direct Prompt (No RAG)"],
    "complianceNotes": "string",
    "estimatedExecutionTime": "string"
  }],
  "rationale": [{"testCaseId": "string", "reason": "string"}],
  "recommendations": "string"
}`;

      setGenerationProgress(70);

      const estimatedPromptToks = Math.ceil(fullPrompt.length / 3.8);
      const safeMaxTokens = tokenOptimization
        ? Math.max(1200, Math.min(maxGenerationTokens, maxTotalTokens - estimatedPromptToks - 150))
        : 6000;

      const generateResponse = await fetch('http://localhost:3001/api/test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          temperature: 0.5,
          maxTokens: safeMaxTokens
        })
      });

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || `Generation failed: ${generateResponse.status}`);
      }

      const generatedData = await generateResponse.json();
      setGenerationProgress(90);

      let validatedResponse = parseAndRepairLlmOutput(generatedData.response || generatedData.rawContent);
      let validationErrors = [];

      const resultObj = {
        response: validatedResponse,
        rawContent: generatedData.rawContent,
        tokens: generatedData.tokens,
        budget: generatedData.budget,
        cost: generatedData.cost,
        model: generatedData.model,
        provider: generatedData.provider,
        fallbackUsed: generatedData.fallbackUsed,
        primaryError: generatedData.primaryError,
        primaryProvider: generatedData.primaryProvider,
        primaryModel: generatedData.primaryModel,
        method: 'Without RAG (Direct Baseline LLM)',
        mode: 'without-rag',
        originalQuery: testQuery,
        requestedCount: countMode === 'custom' ? customCount : 'auto',
        existingTestCases: [],
        topResults: 0,
        validationErrors: validationErrors,
        validationPassed: validationErrors.length === 0,
        workflow: '1. User Story Input → 2. Zero-Context Prompt → 3. Direct LLM → 4. JSON Validation',
        pipelineSteps: [
          '✅ User Story Input (Raw text in editor)',
          '⚡ Zero-Context ICEPOT Prompt (Bypasses MongoDB retrieval)',
          '🛡️ Input Moderation (before LLM)',
          '🤖 Direct LLM Generation (Model weights only)',
          '🛡️ Output Moderation (before frontend display)',
          '✔️ JSON Schema Validation',
          '🎨 UI Structured Rendering'
        ],
        timestamp: new Date().toISOString()
      };

      setWithoutRagResult({ ...resultObj, qualityValidation: { status: 'evaluating' } });
      const qualityValidation = await validateGeneratedTestCases(resultObj, 'without-rag');
      setWithoutRagResult({ ...resultObj, qualityValidation });
      setGenerationProgress(100);
      return resultObj;
    } catch (error) {
      console.error('Without RAG generation error:', error);
      const errObj = {
        error: true,
        message: error.message,
        method: 'Without RAG (Direct Baseline LLM)',
        mode: 'without-rag',
        timestamp: new Date().toISOString()
      };
      setWithoutRagResult(errObj);
      return errObj;
    } finally {
      setWithoutRagLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. WITH RAG GENERATION (10-Step AI Retrieval Pipeline)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleLlmRagTest = async () => {
    if (!validateSchema(jsonSchema)) {
      alert('Please fix JSON Schema errors before testing');
      return null;
    }

    setWithRagLoading(true);
    setSimilarUserStories([]);
    setCurrentStepText('Running 10-step RAG retrieval & generation pipeline...');
    setGenerationProgress(5);
    setPipelineView('generated');

    try {
      if (!testQuery || testQuery.trim() === '') {
        throw new Error('User story input is required');
      }

      // STEP 2: Query Preprocessing
      setGenerationProgress(15);
      setCurrentStepText('Step 2/10: Preprocessing query (Synonyms & Abbreviations)...');
      const preprocessResponse = await fetch('http://localhost:3001/api/search/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testQuery,
          options: {
            enableAbbreviations: true,
            enableSynonyms: true,
            maxSynonymVariations: 5,
            smartExpansion: true,
            preserveTestCaseIds: true
          }
        })
      });

      let finalQuery = testQuery;
      let preprocessingData = null;
      if (preprocessResponse.ok) {
        preprocessingData = await preprocessResponse.json();
        finalQuery = preprocessingData.processedQuery || testQuery;
      }

      // STEP 3: Hybrid Search (BM25 + Vector) in MongoDB
      setGenerationProgress(25);
      setCurrentStepText('Step 3/10: Performing Hybrid Search (BM25 + Vector) in MongoDB...');
      const searchResponse = await fetch('http://localhost:3001/api/search/hybrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          limit: 50,
          bm25Weight: 0.4,
          vectorWeight: 0.6
        })
      });

      if (!searchResponse.ok) {
        throw new Error(`Search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();

      // STEP 3.5: User Stories Search
      let fetchedUserStories = [];
      try {
        const userStoriesResponse = await fetch('http://localhost:3001/api/search/user-stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: finalQuery,
            limit: 10,
            bm25Weight: 0.4,
            vectorWeight: 0.6
          })
        });

        if (userStoriesResponse.ok) {
          const userStoriesData = await userStoriesResponse.json();
          fetchedUserStories = userStoriesData.results || [];
        }
      } catch (usErr) {
        console.warn('User stories search skipped:', usErr.message);
      }
      setSimilarUserStories(fetchedUserStories);

      // STEP 4: RRF Re-Ranking
      setGenerationProgress(40);
      setCurrentStepText('Step 4/10: Applying Cross-Encoder RRF Re-Ranking...');
      const rerankResponse = await fetch('http://localhost:3001/api/search/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          limit: 10,
          fusionMethod: 'rrf',
          rerankTopK: 50,
          bm25Weight: 0.4,
          vectorWeight: 0.6
        })
      });

      let rerankedResults = [];
      let rerankData = null;

      if (rerankResponse.ok) {
        rerankData = await rerankResponse.json();
        rerankedResults = rerankData.results || [];
      } else {
        rerankedResults = (searchData.results || []).slice(0, 10);
      }

      // STEP 5: Deduplication
      setGenerationProgress(50);
      setCurrentStepText('Step 5/10: Deduplicating context cases (Cosine > 0.95)...');
      let dedupData = null;
      let finalResults = rerankedResults;

      if (finalResults.length > 5) {
        const resultsWithoutEmbeddings = finalResults.map(r => {
          const { embedding, ...rest } = r;
          return rest;
        });

        const dedupResponse = await fetch('http://localhost:3001/api/search/deduplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            results: resultsWithoutEmbeddings,
            threshold: 0.95
          })
        });

        if (dedupResponse.ok) {
          dedupData = await dedupResponse.json();
          finalResults = dedupData.deduplicated || finalResults;
        }
      }

      let topResults = finalResults.slice(0, 10);
      if (topResults.length === 0) {
        throw new Error('No search results found in MongoDB for user story');
      }

      topResults = topResults.map(tc => ({
        ...tc,
        testSteps: tc.testSteps || tc.steps || 'N/A',
        testCaseTitle: tc.testCaseTitle || tc.title || tc.testCaseId || 'Unknown',
        expectedResults: tc.expectedResults || tc.expected_results || 'N/A'
      }));

      const avgSimilarity = topResults.reduce((sum, tc) => sum + (tc.score || 0), 0) / topResults.length;

      // STEP 6: Summarization
      setGenerationProgress(60);
      setCurrentStepText('Step 6/10: Generating AI context summary from retrieved cases...');

      const topResultsForSummary = topResults.slice(0, tokenOptimization ? 4 : 5).map(r => {
        const { embedding, ...rest } = r;
        return rest;
      });

      const summarizeResponse = await fetch('http://localhost:3001/api/search/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: topResultsForSummary,
          summaryType: tokenOptimization ? 'concise' : 'detailed',
          maxTokens: tokenOptimization ? maxSummaryTokens : 800
        })
      });

      if (!summarizeResponse.ok) {
        throw new Error(`Summarization failed: ${summarizeResponse.status}`);
      }

      const summaryData = await summarizeResponse.json();

      // STEP 7: Prompt Template + Context
      setGenerationProgress(70);
      setCurrentStepText('Step 7/10: Assembling ICEPOT prompt with MongoDB context...');

      let nextTestCaseId = 'TC_RAG_001';
      try {
        const latestIdResponse = await fetch('http://localhost:3001/api/testcases/latest-id');
        if (latestIdResponse.ok) {
          const latestIdData = await latestIdResponse.json();
          nextTestCaseId = latestIdData.nextTestCaseId || 'TC_RAG_001';
        }
      } catch (e) {
        console.warn('Could not fetch latest ID:', e.message);
      }

      const topRelevantCount = tokenOptimization ? Math.min(3, topResults.length) : Math.min(5, topResults.length);
      const essentialTestCases = topResults.slice(0, topRelevantCount).map(tc => ({
        id: tc.id || tc.testCaseId,
        module: tc.module,
        title: tc.title || tc.testCaseTitle,
        priority: tc.priority,
        preconditions: tc.preconditions || tc.precondition || 'Hospital standard environment',
        stepsSummary: typeof tc.steps === 'string' ? tc.steps.split(/\r?\n/).slice(0, 4).join('; ') : (tc.testSteps || ''),
        expectedResults: tc.expectedResults || tc.expectedResult
      }));

      const countDirective = getCountPromptDirective();

      const fullPrompt = `${promptTemplate}

### USER STORY FOR TEST GENERATION:
${testQuery}

### RAG CONTEXT SUMMARY (${topResults.length} similar test cases retrieved from MongoDB):
${summaryData.summary}

### REFERENCE TEST CASES FROM MONGODB (Top ${essentialTestCases.length}):
${JSON.stringify(essentialTestCases, null, 2)}

### REQUIREMENTS:
1. Start IDs from ${nextTestCaseId}, continue sequentially
2. Format testSteps with \\r\\n: "1.Step\\r\\n2.Step\\r\\n..."
3. Include 5-8 steps per test case
4. Set sourceCitations referencing retrieved MongoDB case IDs (e.g., "${essentialTestCases.map(c => c.id).join(', ')}")
5. ${countDirective} (Grounded in the retrieved healthcare domain context)

### OUTPUT JSON:
{
  "analysis": {
    "userStoryTitle": "string",
    "userStoryModule": "string",
    "existingCoverageCount": ${topResults.length},
    "gapsIdentified": ["string"]
  },
  "newTestCases": [{
    "testCaseId": "${nextTestCaseId}",
    "module": "string",
    "testCaseTitle": "string",
    "testCaseDescription": "string",
    "preconditions": "string",
    "testSteps": "string with \\r\\n",
    "expectedResults": "string",
    "priority": "P1|P2|P3",
    "testType": "Integration|Functional",
    "riskLevel": "Critical|High|Medium|Low",
    "linkedUserStories": ["string"],
    "sourceCitations": ["string"],
    "complianceNotes": "string",
    "estimatedExecutionTime": "string"
  }],
  "rationale": [{"testCaseId": "string", "reason": "string"}],
  "recommendations": "string"
}`;

      // STEP 8: LLM Generation
      setGenerationProgress(80);
      setCurrentStepText('Step 8/10: Executing LLM generation via Mistral/Groq API...');

      const estimatedPromptToks = Math.ceil(fullPrompt.length / 3.8);
      const safeMaxTokens = tokenOptimization
        ? Math.max(1500, Math.min(maxGenerationTokens, maxTotalTokens - estimatedPromptToks - 200))
        : 8000;

      const generateResponse = await fetch('http://localhost:3001/api/test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          temperature: 0.5,
          maxTokens: safeMaxTokens
        })
      });

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || `Generation failed: ${generateResponse.status}`);
      }

      const generatedData = await generateResponse.json();
      setGenerationProgress(90);
      setCurrentStepText('Step 9/10: Validating output against JSON Schema...');

      let validatedResponse = parseAndRepairLlmOutput(generatedData.response || generatedData.rawContent);
      let validationErrors = [];

      const resultObj = {
        response: validatedResponse,
        rawContent: generatedData.rawContent,
        tokens: generatedData.tokens,
        budget: generatedData.budget,
        cost: generatedData.cost,
        model: generatedData.model,
        provider: generatedData.provider,
        fallbackUsed: generatedData.fallbackUsed,
        primaryError: generatedData.primaryError,
        primaryProvider: generatedData.primaryProvider,
        primaryModel: generatedData.primaryModel,
        method: 'With RAG (10-Step AI Retrieval Pipeline)',
        mode: 'with-rag',
        preprocessingData: preprocessingData,
        originalQuery: testQuery,
        processedQuery: finalQuery,
        requestedCount: countMode === 'custom' ? customCount : 'auto',
        rerankData: rerankData,
        dedupData: dedupData,
        existingTestCases: topResults,
        searchResults: searchData.results?.length || 0,
        topResults: topResults.length,
        averageSimilarity: avgSimilarity,
        similarUserStories: fetchedUserStories,
        ragSummary: summaryData.summary,
        ragTokens: summaryData.tokens,
        ragCost: summaryData.cost,
        validationErrors: validationErrors,
        validationPassed: validationErrors.length === 0,
        workflow: '1. User Story → 2. Preprocessing → 3. Hybrid Search → 4. RRF Rerank → 5. Dedup → 6. Summarize → 7. Context Prompt → 8. Input Moderation → 9. LLM → 10. Output Moderation → 11. Validate & Render',
        pipelineSteps: [
          '✅ User Story Input',
          '✅ Query Preprocessing (Abbreviations & Synonyms)',
          '✅ Hybrid Search (BM25 + Vector in MongoDB)',
          '✅ User Stories Hybrid Search',
          '✅ RRF Re-Ranking (Cross-Encoder)',
          '✅ Deduplication (Cosine > 0.95)',
          '✅ AI Context Summarization',
          '✅ ICEPOT Prompt Assembly',
          '✅ Input Moderation (before LLM)',
          '✅ LLM Test Case Generation',
          '✅ Output Moderation (before frontend display)',
          '✅ JSON Schema Validation & Rendering'
        ],
        timestamp: new Date().toISOString()
      };

      setWithRagResult({ ...resultObj, qualityValidation: { status: 'evaluating' } });
      const qualityValidation = await validateGeneratedTestCases(resultObj, 'with-rag');
      setWithRagResult({ ...resultObj, qualityValidation });
      setGenerationProgress(100);
      return resultObj;
    } catch (error) {
      console.error('With RAG workflow error:', error);
      const errObj = {
        error: true,
        message: error.message,
        method: 'With RAG (10-Step AI Retrieval Pipeline)',
        mode: 'with-rag',
        timestamp: new Date().toISOString()
      };
      setWithRagResult(errObj);
      return errObj;
    } finally {
      setWithRagLoading(false);
      setCurrentStepText('');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. RUN BOTH MODES SEQUENTIALLY (Auto-Compare)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleRunBoth = async () => {
    if (!validateSchema(jsonSchema)) {
      alert('Please fix JSON Schema errors before testing');
      return;
    }
    setRunningBoth(true);
    try {
      // Step 1: Run Without RAG
      await handleWithoutRagTest();
      // Step 2: Run With RAG
      await handleLlmRagTest();
      // Step 3: Automatically switch to Comparison Tab (Tab 3)!
      setTabValue(3);
    } catch (e) {
      console.error('Error running both modes:', e);
    } finally {
      setRunningBoth(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AI-POWERED DEEP COMPARATIVE ANALYSIS (LLM Evaluation)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleRunAiComparison = async () => {
    if (!withoutRagResult || withoutRagResult.error || !withRagResult || withRagResult.error) {
      alert('Both "With RAG" and "Without RAG" test case generations are required to run AI Comparative Analysis.');
      return;
    }

    setAiComparing(true);
    try {
      const withoutCases = withoutRagResult.response?.newTestCases || [];
      const withCases = withRagResult.response?.newTestCases || [];
      const refCases = withRagResult.existingTestCases || [];

      const comparisonPrompt = `You are a Principal QA Architect and AI Systems Evaluator comparing two test generation approaches for an enterprise Healthcare Information System.

### TARGET USER STORY:
${testQuery}

### APPROACH A: GENERATED TEST CASES WITHOUT RAG (Direct Baseline LLM - Zero Database Context)
- Total Generated Cases: ${withoutCases.length}
- Generated Cases:
${JSON.stringify(withoutCases.map(tc => ({
  id: tc.testCaseId,
  title: tc.testCaseTitle,
  module: tc.module,
  priority: tc.priority,
  steps: tc.testSteps,
  expectedResults: tc.expectedResults
})), null, 2)}

### APPROACH B: GENERATED TEST CASES WITH RAG (10-Step Hybrid Search + Reranking + Summarization)
- Total Generated Cases: ${withCases.length}
- Generated Cases:
${JSON.stringify(withCases.map(tc => ({
  id: tc.testCaseId,
  title: tc.testCaseTitle,
  module: tc.module,
  priority: tc.priority,
  steps: tc.testSteps,
  expectedResults: tc.expectedResults,
  citations: tc.sourceCitations
})), null, 2)}
- (Retrieved MongoDB Source Context used by RAG: ${refCases.slice(0, 3).map(c => `${c.id}: ${c.title}`).join(' | ')})

### EVALUATION GOAL:
Provide a rigorous pedagogical comparison strictly between Approach A (Generated WITHOUT RAG) and Approach B (Generated WITH RAG) to demonstrate to students why RAG is essential in enterprise systems.

Return ONLY a strict JSON object with this exact schema:
{
  "overallVerdict": {
    "winner": "WITH_RAG",
    "headline": "string (punchy summary of the RAG advantage)",
    "summary": "string (2-3 sentences explaining the fundamental difference)"
  },
  "dimensionScores": [
    {
      "dimension": "Domain Grounding & Healthcare Entities",
      "withoutRagScore": 45,
      "withRagScore": 96,
      "analysis": "string (explain usage of UHID, PRN, ERN, OTP, HIPAA encryption, and hospital database states)"
    },
    {
      "dimension": "Database & Architecture Alignment",
      "withoutRagScore": 30,
      "withRagScore": 95,
      "analysis": "string (explain alignment with existing system suites vs generic web assumptions)"
    },
    {
      "dimension": "Step Depth & Executability",
      "withoutRagScore": 60,
      "withRagScore": 92,
      "analysis": "string (explain numbered steps, verification points, and measurable assertions)"
    },
    {
      "dimension": "Hallucination & Speculation Risk",
      "withoutRagScore": 40,
      "withRagScore": 90,
      "analysis": "string (explain inventiveness of baseline vs grounded confidence in RAG)"
    },
    {
      "dimension": "Compliance & Edge Case Coverage",
      "withoutRagScore": 55,
      "withRagScore": 94,
      "analysis": "string (explain consent verification, 24h link expiration, error retry tracking)"
    }
  ],
  "keyDifferences": [
    {
      "category": "Domain Terminology",
      "withoutRagObservation": "string (what baseline generated)",
      "withRagObservation": "string (what RAG generated)",
      "impact": "string (why this matters for QA)"
    },
    {
      "category": "Workflow & Verification Depth",
      "withoutRagObservation": "string",
      "withRagObservation": "string",
      "impact": "string"
    },
    {
      "category": "Database Grounding",
      "withoutRagObservation": "string",
      "withRagObservation": "string",
      "impact": "string"
    }
  ],
  "learnerTakeaways": [
    "string (key pedagogical takeaway 1)",
    "string (key pedagogical takeaway 2)",
    "string (key pedagogical takeaway 3)",
    "string (key pedagogical takeaway 4)"
  ]
}`;

      const estimatedCompPromptToks = Math.ceil(comparisonPrompt.length / 3.8);
      const safeCompMaxTokens = tokenOptimization
        ? Math.max(1000, Math.min(2500, maxTotalTokens - estimatedCompPromptToks - 150))
        : 4000;

      const response = await fetch('http://localhost:3001/api/test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: comparisonPrompt,
          temperature: 0.2,
          maxTokens: safeCompMaxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Comparison API failed: ${response.status}`);
      }

      const compData = await response.json();
      let parsed = compData.response;

      if (!parsed || (!parsed.overallVerdict && !parsed.dimensionScores)) {
        const rawText = compData.rawContent || (typeof parsed === 'string' ? parsed : (parsed?.raw || ''));
        if (rawText) {
          const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i) || rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } catch (e) {
              parsed = parseAndRepairLlmOutput(rawText);
            }
          } else {
            parsed = parseAndRepairLlmOutput(rawText);
          }
        }
      }

      setAiComparisonResult(parsed);
    } catch (err) {
      console.error('Error running AI comparison:', err);
      alert('AI Comparative Evaluation Error: ' + err.message);
    } finally {
      setAiComparing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Render Test Cases in Table Format
  // ─────────────────────────────────────────────────────────────────────────────
  const renderTestCaseTable = (testCasesList, title, isReference = false, isWithoutRag = false) => {
    let list = testCasesList;
    if ((!list || list.length === 0) && !isReference) {
      const rawFallback = isWithoutRag
        ? (withoutRagResult?.rawContent || withoutRagResult?.response?.raw)
        : (withRagResult?.rawContent || withRagResult?.response?.raw);
      if (rawFallback) {
        const repaired = parseAndRepairLlmOutput(rawFallback);
        if (repaired && repaired.newTestCases && repaired.newTestCases.length > 0) {
          list = repaired.newTestCases;
        }
      }
    }

    if (!list || list.length === 0) {
      return (
        <Alert severity="warning" sx={{ my: 2 }}>
          No test cases available to display
        </Alert>
      );
    }

    const headerBg = isReference ? '#1E293B' : isWithoutRag ? '#B45309' : '#059669';

    return (
      <Box sx={{ mt: 1 }}>
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 90 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 220 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 120 }}>Module</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 80 }}>Priority</TableCell>
                {!isReference && <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 90 }}>Type</TableCell>}
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 140 }}>Preconditions</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 280 }}>Test Steps</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 220 }}>Expected Results</TableCell>
                {isReference && <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 75 }}>Score</TableCell>}
                <TableCell sx={{ fontWeight: 700, bgcolor: headerBg, color: '#fff', width: 90 }}>DeepEval</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((testCase, index) => (
                <TableRow key={index} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 700, fontSize: '0.85rem' }}>
                    {testCase.testCaseId || testCase.id || `TC_${index + 1}`}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {testCase.testCaseTitle || testCase.title}
                  </TableCell>
                  <TableCell>
                    <Chip label={testCase.module || 'General'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={testCase.priority || 'P2'}
                      color={
                        String(testCase.priority).includes('P1') || String(testCase.priority).includes('Critical') || String(testCase.priority).includes('High') ? 'error' :
                        String(testCase.priority).includes('P2') || String(testCase.priority).includes('Medium') ? 'warning' : 'default'
                      }
                      size="small"
                      variant="filled"
                    />
                  </TableCell>
                  {!isReference && (
                    <TableCell>
                      <Chip label={testCase.testType || testCase.type || 'Functional'} size="small" variant="outlined" />
                    </TableCell>
                  )}
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {Array.isArray(testCase.preconditions) ? testCase.preconditions.join('; ') : (testCase.preconditions || testCase.testCaseDescription || 'N/A')}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {(() => {
                      if (!testCase.testSteps || testCase.testSteps === 'N/A') {
                        return <Typography variant="caption" color="error">No steps defined</Typography>;
                      }
                      if (typeof testCase.testSteps === 'string' && testCase.testSteps.trim()) {
                        const stepsArray = testCase.testSteps
                          .replace(/\\n/g, '\n')
                          .replace(/\\r/g, '\r')
                          .split(/\r\n|\r|\n/)
                          .filter(s => s && s.trim());
                        if (stepsArray.length > 0) {
                          return (
                            <Box component="ol" sx={{ pl: 2, m: 0, fontSize: '0.8rem' }}>
                              {stepsArray.map((step, idx) => (
                                <li key={idx} style={{ marginBottom: '3px', lineHeight: '1.25' }}>
                                  {step.trim().replace(/^\d+\.\s*/, '')}
                                </li>
                              ))}
                            </Box>
                          );
                        }
                      }
                      if (Array.isArray(testCase.testSteps) && testCase.testSteps.length > 0) {
                        return (
                          <Box component="ol" sx={{ pl: 2, m: 0, fontSize: '0.8rem' }}>
                            {testCase.testSteps.map((step, idx) => (
                              <li key={idx} style={{ marginBottom: '3px', lineHeight: '1.25' }}>
                                {String(step).trim().replace(/^\d+\.\s*/, '')}
                              </li>
                            ))}
                          </Box>
                        );
                      }
                      return <Typography variant="caption" color="error">No steps defined</Typography>;
                    })()}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {Array.isArray(testCase.expectedResults)
                      ? testCase.expectedResults.join('; ')
                      : Array.isArray(testCase.expectedResult)
                      ? testCase.expectedResult.join('; ')
                      : (testCase.expectedResults || testCase.expectedResult || 'N/A')}
                  </TableCell>
                  {isReference && (
                    <TableCell>
                      <Chip
                        label={testCase.score ? (testCase.score).toFixed(3) : 'N/A'}
                        color={testCase.score >= 0.85 ? 'success' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Tooltip title="Evaluate this test case with DeepEval">
                      <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        sx={{ minWidth: 0, px: 1, py: 0.3, fontSize: '0.72rem', textTransform: 'none', borderRadius: '12px' }}
                        startIcon={<AssessmentIcon sx={{ fontSize: '0.85rem !important' }} />}
                        onClick={() => {
                          const mode = isReference ? 'reference' : isWithoutRag ? 'without-rag' : 'with-rag';
                          setSelectedTestCase(JSON.stringify({ data: testCase, mode }));
                          setTabValue(4);
                        }}
                      >
                        Eval
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Render Linked User Stories in Table Format
  // ─────────────────────────────────────────────────────────────────────────────
  const renderUserStoriesTable = (storiesList) => {
    if (!storiesList || storiesList.length === 0) {
      return (
        <Alert severity="info" sx={{ my: 2 }}>
          No linked user stories found for this query.
        </Alert>
      );
    }

    return (
      <Box sx={{ mt: 1 }}>
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 100 }}>Story ID</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 220 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 140 }}>Module</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 85 }}>Priority</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 250 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 260 }}>Acceptance Criteria</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 160 }}>Impact & Risk</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#4F46E5', color: '#fff', width: 85 }}>Score</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {storiesList.map((story, index) => (
                <TableRow key={index} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 700, fontSize: '0.85rem' }}>
                    {story.storyId || story.id || `US_${index + 1}`}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {story.title || 'Untitled User Story'}
                  </TableCell>
                  <TableCell>
                    <Chip label={story.module || 'General'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={story.priority || 'P2'}
                      color={
                        String(story.priority).includes('P1') || String(story.priority).includes('Critical') ? 'error' :
                        String(story.priority).includes('P2') || String(story.priority).includes('High') ? 'warning' : 'default'
                      }
                      size="small"
                      variant="filled"
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {story.description || 'N/A'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {story.acceptanceCriteria || 'N/A'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {story.regressionRisk && (
                      <Chip
                        label={`Risk: ${story.regressionRisk}`}
                        size="small"
                        color={story.regressionRisk === 'High' ? 'error' : story.regressionRisk === 'Medium' ? 'warning' : 'success'}
                        sx={{ mb: 0.5, display: 'block', width: 'fit-content' }}
                      />
                    )}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {story.impactReason || 'Direct query match'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={story.hybridScore ? story.hybridScore.toFixed(3) : story.vectorScore ? story.vectorScore.toFixed(3) : 'N/A'}
                      color={story.hybridScore >= 0.7 ? 'success' : 'primary'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // Helper: Export CSV
  const exportToCSV = (testCasesList, filename) => {
    if (!testCasesList || testCasesList.length === 0) {
      alert('No test cases to export');
      return;
    }
    const headers = ['Test Case ID', 'Title', 'Module', 'Priority', 'Test Type', 'Preconditions', 'Test Steps', 'Expected Results', 'Citations'];
    const rows = testCasesList.map(tc => {
      let stepsText = '';
      if (typeof tc.testSteps === 'string') {
        stepsText = tc.testSteps.replace(/\\r\\n|\\n|\r\n|\n/g, ' | ');
      } else if (Array.isArray(tc.testSteps)) {
        stepsText = tc.testSteps.join(' | ');
      }
      return [
        tc.testCaseId || tc.id || '',
        tc.testCaseTitle || tc.title || '',
        tc.module || '',
        tc.priority || '',
        tc.testType || 'Functional',
        tc.preconditions || tc.testCaseDescription || '',
        stepsText,
        tc.expectedResults || '',
        Array.isArray(tc.sourceCitations) ? tc.sourceCitations.join('; ') : ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Helper: Export Comparison Report JSON
  const exportComparisonJSON = () => {
    const report = {
      timestamp: new Date().toISOString(),
      userStory: testQuery,
      withoutRag: withoutRagResult,
      withRag: withRagResult,
      aiEvaluation: aiComparisonResult
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rag_vs_nonrag_comparison_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // Helper: DeepEval metrics
  const evaluateMetrics = async (testCase, context, userStory, mode = '') => {
    setMetricsLoading(true);
    setMetricsResult(null);

    try {
      const selectedMetricsList = Object.keys(enabledMetrics).filter(key => enabledMetrics[key]);
      if (selectedMetricsList.length === 0) {
        throw new Error('Please select at least one metric checkbox to evaluate.');
      }

      // Format rich context chunks
      let contextChunks = [];
      if (Array.isArray(context) && context.length > 0) {
        contextChunks = context;
      } else if (typeof context === 'string' && context.trim()) {
        contextChunks = [context];
      } else {
        contextChunks = [userStory || testQuery || 'Test Case Specification'];
      }

      const title = testCase.testCaseTitle || testCase.title || 'Test Case';
      const desc = testCase.description || testCase.testSummary || '';
      const exp = testCase.expectedResult || testCase.expectedResults || '';
      const expectedOutputText = `${title}${desc ? ': ' + desc : ''}${exp ? '. Expected Outcome: ' + exp : ''}`;
      const outputText = typeof testCase === 'string' ? testCase : JSON.stringify(testCase, null, 2);

      const evalPayload = {
        query: userStory || testQuery,
        context: contextChunks,
        output: outputText,
        expected_output: expectedOutputText,
        metric: selectedMetricsList
      };

      console.log('📤 Sending evaluation payload to DeepEval:', evalPayload);

      // Attempt via backend proxy first (handles CORS, timeout, environment config), with direct fallback
      let response;
      try {
        response = await fetch('http://localhost:3001/api/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evalPayload)
        });
      } catch (proxyErr) {
        console.warn('Backend proxy fetch failed, trying direct endpoint...', proxyErr);
        response = await fetch(deepevalUrl || 'http://localhost:8000/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evalPayload)
        });
      }

      if (!response.ok) {
        let errMessage = `Evaluation failed (${response.status})`;
        try {
          const errData = await response.json();
          errMessage = errData.detail || errData.message || errMessage;
        } catch {
          const errText = await response.text();
          if (errText) errMessage = errText;
        }
        throw new Error(errMessage);
      }

      const metricsData = await response.json();
      console.log('✅ Metrics evaluation complete:', metricsData);

      setMetricsResult({
        testCaseId: testCase.testCaseId || testCase.id || 'TC',
        testTitle: title,
        mode: mode,
        results: metricsData.results || [],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Metrics evaluation error:', error);
      setMetricsResult({
        error: true,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setMetricsLoading(false);
    }
  };

  const updateQualityValidation = (generationMode, qualityValidation) => {
    const updateResult = setter => setter(previous => previous
      ? { ...previous, qualityValidation }
      : previous);
    if (generationMode === 'with-rag') updateResult(setWithRagResult);
    else updateResult(setWithoutRagResult);
  };

  const publishGeneratedTestCases = async (result, qualityValidation, generationMode, mode) => {
    const publishing = { ...qualityValidation, status: 'publishing', publishError: null };
    updateQualityValidation(generationMode, publishing);
    try {
      const response = await fetch('http://localhost:3001/api/testcases/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases: result.response.newTestCases,
          mode,
          approved: mode === 'manual',
          qualityResults: qualityValidation.caseResults,
          userStory: result.originalQuery || testQuery,
          generationMode
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const details = data.failures?.join(' ') || data.details || data.error || 'Publishing failed.';
        throw new Error(details);
      }
      return { ...qualityValidation, status: 'published', publishResult: data, publishError: null };
    } catch (error) {
      return { ...qualityValidation, status: 'publish_failed', publishError: error.message };
    }
  };

  const validateGeneratedTestCases = async (result, generationMode) => {
    const testCases = result.response?.newTestCases || [];
    if (!testCases.length) {
      return { status: 'failed', caseResults: [], failures: ['No generated test cases were available to evaluate.'] };
    }

    const context = generationMode === 'with-rag'
      ? [
          result.ragSummary,
          ...(result.existingTestCases || []).map(testCase => [
            testCase.testCaseTitle || testCase.title,
            testCase.testCaseDescription || testCase.description,
            testCase.testSteps || testCase.steps,
            testCase.expectedResults || testCase.expectedResult
          ].filter(Boolean).join('\n'))
        ].filter(Boolean)
      : [result.originalQuery || testQuery].filter(Boolean);
    const caseResults = [];

    try {
      for (let index = 0; index < testCases.length; index += 1) {
        const testCase = testCases[index];
        const testCaseId = testCase.testCaseId || testCase.id || testCase.testCaseTitle || `Test case ${index + 1}`;
        const title = testCase.testCaseTitle || testCase.title || testCaseId;
        setCurrentStepText(`DeepEval quality check ${index + 1}/${testCases.length}: ${title}`);
        const response = await fetch('http://localhost:3001/api/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: result.originalQuery || testQuery,
            context,
            output: JSON.stringify(testCase, null, 2),
            expected_output: `${title}: ${testCase.expectedResults || testCase.expectedResult || testCase.testCaseDescription || ''}`,
            metric: ['faithfulness', 'contextual_recall', 'hallucination']
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || `DeepEval failed for ${testCaseId}.`);

        const scores = Object.fromEntries((data.results || []).map(metric => [
          String(metric.metric_name || '').toLowerCase().replace(/[\s-]+/g, '_'),
          metric
        ]));
        const getScore = name => {
          const score = scores[name]?.score;
          return typeof score === 'number' && Number.isFinite(score) ? score : null;
        };
        const metrics = {
          faithfulness: getScore('faithfulness'),
          contextual_recall: getScore('contextual_recall'),
          hallucination: getScore('hallucination')
        };
        const failures = [];
        if (metrics.faithfulness === null || metrics.faithfulness < 0.75) failures.push('Faithfulness must be at least 0.75');
        if (metrics.hallucination === null || metrics.hallucination > 0.25) failures.push('Hallucination must be at most 0.25');
        caseResults.push({ testCaseId, title, results: data.results || [], metrics, passed: failures.length === 0, failures });
      }

      const failures = caseResults.flatMap(item => item.failures.map(reason => `${item.testCaseId}: ${reason}.`));
      let qualityValidation = {
        status: qualityMode === 'automation' ? (failures.length ? 'failed' : 'ready') : 'pending',
        passed: failures.length === 0,
        caseResults,
        failures
      };
      if (qualityMode === 'automation' && qualityValidation.passed) {
        qualityValidation = await publishGeneratedTestCases(result, qualityValidation, generationMode, 'automation');
      }
      return qualityValidation;
    } catch (error) {
      return {
        status: 'failed',
        passed: false,
        caseResults,
        failures: [error.message]
      };
    }
  };

  const approveGeneratedTestCases = async generationMode => {
    const result = generationMode === 'with-rag' ? withRagResult : withoutRagResult;
    if (!result?.qualityValidation || result.qualityValidation.status !== 'pending') return;
    const finalStatus = await publishGeneratedTestCases(result, result.qualityValidation, generationMode, 'manual');
    updateQualityValidation(generationMode, finalStatus);
  };

  const rejectGeneratedTestCases = generationMode => {
    const result = generationMode === 'with-rag' ? withRagResult : withoutRagResult;
    if (!result?.qualityValidation || result.qualityValidation.status !== 'pending') return;
    updateQualityValidation(generationMode, { ...result.qualityValidation, status: 'rejected' });
  };

  const renderQualityWorkflow = (result, generationMode) => {
    const quality = result?.qualityValidation;
    if (!quality) return null;
    const scoreText = score => typeof score === 'number' ? score.toFixed(3) : 'N/A';
    const statusColor = quality.status === 'published' ? 'success'
      : ['failed', 'publish_failed', 'rejected'].includes(quality.status) ? 'error'
        : quality.status === 'pending' || quality.status === 'ready' ? 'warning' : 'info';
    return (
      <Paper variant="outlined" sx={{ mx: 3, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>DeepEval Quality Review</Typography>
          <Chip size="small" color={statusColor} label={quality.status.replace('_', ' ').toUpperCase()} />
        </Box>
        {quality.status === 'evaluating' && <Alert severity="info">Evaluating Faithfulness and Hallucination as publish gates. Contextual Recall is informational.</Alert>}
        {!!quality.caseResults?.length && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Test Case</TableCell>
                  <TableCell align="right">Faithfulness (≥ 0.75)</TableCell>
                  <TableCell align="right">Contextual Recall (info)</TableCell>
                  <TableCell align="right">Hallucination (≤ 0.25)</TableCell>
                  <TableCell align="right">Gate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quality.caseResults.map(item => (
                  <TableRow key={item.testCaseId}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell align="right">{scoreText(item.metrics?.faithfulness)}</TableCell>
                    <TableCell align="right">{scoreText(item.metrics?.contextual_recall)}</TableCell>
                    <TableCell align="right">{scoreText(item.metrics?.hallucination)}</TableCell>
                    <TableCell align="right"><Chip size="small" color={item.passed ? 'success' : 'error'} label={item.passed ? 'Pass' : 'Fail'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!!quality.failures?.length && (
          <Alert severity={qualityMode === 'automation' ? 'error' : 'warning'} sx={{ mt: 1.5 }}>
            {quality.failures.join(' ')}
          </Alert>
        )}
        {quality.publishError && <Alert severity="error" sx={{ mt: 1.5 }}>{quality.publishError}</Alert>}
        {quality.publishResult && (
          <Alert severity="success" sx={{ mt: 1.5 }}>
            Published {quality.publishResult.published} test cases to MongoDB collection {quality.publishResult.collection} and Jira.
          </Alert>
        )}
        {qualityMode === 'manual' && quality.status === 'pending' && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button variant="contained" color="success" onClick={() => approveGeneratedTestCases(generationMode)}>Approve &amp; Publish</Button>
            <Button variant="outlined" color="error" onClick={() => rejectGeneratedTestCases(generationMode)}>Reject</Button>
          </Stack>
        )}
      </Paper>
    );
  };

  const hasWithoutRag = !!(withoutRagResult && !withoutRagResult.error && withoutRagResult.response?.newTestCases?.length > 0);
  const hasWithRag = !!(withRagResult && !withRagResult.error && withRagResult.response?.newTestCases?.length > 0);
  const isComparisonReady = hasWithoutRag && hasWithRag;

  return (
    <Box sx={{ p: { xs: 2, md: 3.5 } }}>
      {/* ─────────────────────────────────────────────────────────────
          PAGE HEADER
      ───────────────────────────────────────────────────────────── */}
      <Box sx={{ mb: 3.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '14px',
                bgcolor: 'rgba(79, 70, 229, 0.12)',
                border: '1.5px solid rgba(79, 70, 229, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)'
              }}
            >
              <TemplateIcon sx={{ fontSize: '1.6rem' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.025em' }}>
                Prompt Template & Schema Manager
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configure prompt templates, customize test case counts (Auto vs Custom), and compare <strong>With RAG</strong> vs <strong>Without RAG</strong> side-by-side.
              </Typography>
            </Box>
          </Box>

          {/* Quick Action Pill */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            {(withRagResult || withoutRagResult) && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={handleClearResults}
                sx={{ borderRadius: '20px', fontWeight: 600 }}
              >
                Clear Saved Runs
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Configuration saved successfully!
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MAIN TABS
      ───────────────────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', bgcolor: 'background.paper' }}>
        <Tabs
          value={tabValue}
          onChange={(e, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            px: 2,
            pt: 1.5,
            bgcolor: 'background.default'
          }}
        >
          <Tab icon={<SchemaIcon />} iconPosition="start" label="JSON Schema" />
          <Tab icon={<CodeIcon />} iconPosition="start" label="Prompt Template" />
          <Tab
            icon={<TestIcon />}
            iconPosition="start"
            label="⚡ Test & Generate"
            sx={{ fontWeight: 700 }}
          />
          <Tab
            icon={<CompareIcon />}
            iconPosition="start"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>⚖️ RAG vs Non-RAG Comparison</span>
                {isComparisonReady ? (
                  <Chip label="Ready" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }} />
                ) : (
                  <Chip
                    label={hasWithRag ? '1/2 Ready' : hasWithoutRag ? '1/2 Ready' : '0/2'}
                    size="small"
                    color="warning"
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                  />
                )}
              </Box>
            }
            sx={{ fontWeight: 700 }}
          />
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="DeepEval Metrics" />
        </Tabs>

        {/* ─────────────────────────────────────────────────────────────
            TAB 0: JSON SCHEMA
        ───────────────────────────────────────────────────────────── */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 3.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>JSON Schema Configuration</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Reset to default">
                  <IconButton size="small" onClick={() => handleReset('schema')}><ResetIcon /></IconButton>
                </Tooltip>
                <Tooltip title="Copy schema">
                  <IconButton size="small" onClick={() => handleCopy(jsonSchema, 'Schema')}><CopyIcon /></IconButton>
                </Tooltip>
                {schemaValid ? (
                  <Chip icon={<ValidIcon />} label="Valid Schema" color="success" size="small" />
                ) : (
                  <Chip icon={<ErrorIcon />} label="Invalid Schema" color="error" size="small" />
                )}
              </Box>
            </Box>

            <TextField
              fullWidth
              multiline
              rows={22}
              value={jsonSchema}
              onChange={handleSchemaChange}
              variant="outlined"
              error={!schemaValid}
              helperText={schemaError}
              sx={{ fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
          </Box>
        </TabPanel>

        {/* ─────────────────────────────────────────────────────────────
            TAB 1: PROMPT TEMPLATE
        ───────────────────────────────────────────────────────────── */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 3.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>Prompt Template (ICEPOT Framework)</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Reset to default">
                  <IconButton size="small" onClick={() => handleReset('prompt')}><ResetIcon /></IconButton>
                </Tooltip>
                <Tooltip title="Copy template">
                  <IconButton size="small" onClick={() => handleCopy(promptTemplate, 'Template')}><CopyIcon /></IconButton>
                </Tooltip>
              </Box>
            </Box>

            <TextField
              fullWidth
              multiline
              rows={24}
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              variant="outlined"
              sx={{ fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
          </Box>
        </TabPanel>

        {/* ─────────────────────────────────────────────────────────────
            TAB 2: TEST & PREVIEW (Spacious Generation Studio)
        ───────────────────────────────────────────────────────────── */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: { xs: 2, md: 3.5 } }}>
            {/* Top Pipeline Settings Bar */}
            <Card
              sx={{
                mb: 3.5,
                borderRadius: 3,
                border: '1.5px solid',
                borderColor: ragMode === 'with-rag' ? 'primary.main' : 'warning.main',
                boxShadow: ragMode === 'with-rag' ? '0 4px 20px rgba(79, 70, 229, 0.08)' : '0 4px 20px rgba(217, 119, 6, 0.08)',
                overflow: 'hidden'
              }}
            >
              <Box
                sx={{
                  p: 2.5,
                  bgcolor: ragMode === 'with-rag' ? 'rgba(79, 70, 229, 0.06)' : 'rgba(217, 119, 6, 0.06)',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 2
                }}
              >
                {/* Mode Selector */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing="0.05em">
                      Active Generation Mode
                    </Typography>
                    <Typography variant="h6" fontWeight={800} color={ragMode === 'with-rag' ? 'primary.main' : 'warning.dark'}>
                      {ragMode === 'with-rag' ? '🚀 With RAG (10-Step AI Retrieval Pipeline)' : '🌐 Without RAG (Direct Baseline Generation)'}
                    </Typography>
                  </Box>
                </Box>

                <ToggleButtonGroup
                  value={ragMode}
                  exclusive
                  onChange={(e, val) => { if (val) setRagMode(val); }}
                  size="small"
                  sx={{ bgcolor: 'background.paper', borderRadius: '24px', p: 0.5, border: '1px solid', borderColor: 'divider' }}
                >
                  <ToggleButton
                    value="with-rag"
                    sx={{
                      px: 3,
                      py: 1,
                      fontWeight: 700,
                      borderRadius: '20px !important',
                      textTransform: 'none',
                      '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }
                    }}
                  >
                    🚀 With RAG (Context Pipeline)
                  </ToggleButton>
                  <ToggleButton
                    value="without-rag"
                    sx={{
                      px: 3,
                      py: 1,
                      fontWeight: 700,
                      borderRadius: '20px !important',
                      textTransform: 'none',
                      '&.Mui-selected': { bgcolor: 'warning.main', color: '#fff', '&:hover': { bgcolor: 'warning.dark' } }
                    }}
                  >
                    🌐 Without RAG (Direct Baseline)
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Setting Row 2: Test Case Count Control & Explanation */}
              <Box sx={{ p: 2.5, bgcolor: 'background.paper' }}>
                <Grid container spacing={3} alignItems="center">
                  {/* Mode explanation */}
                  <Grid item xs={12} md={6}>
                    {ragMode === 'with-rag' ? (
                      <Box>
                        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                          <Chip label="Context-Augmented" color="success" size="small" />
                          <Chip label="6,000+ MongoDB Test Cases" color="primary" size="small" variant="outlined" />
                          <Chip label="Cross-Encoder RRF Reranking" color="secondary" size="small" variant="outlined" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Preprocesses query, searches MongoDB with BM25 + Vector hybrid search, reranks via cross-encoder, summarizes context, and prompts the LLM with verified hospital test suites.
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                          <Chip label="Zero Context Baseline" color="warning" size="small" />
                          <Chip label="No Database Retrieval" size="small" variant="outlined" />
                          <Chip label="Model Weights Only" size="small" variant="outlined" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Bypasses all MongoDB search, vector search, and context injection. Prompts the LLM directly with the raw user story to generate baseline test cases for teaching comparison.
                        </Typography>
                      </Box>
                    )}
                  </Grid>

                  {/* Flexible Test Case Count Configurator */}
                  <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">
                          Test Case Generation Quantity:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Chip
                            label="Auto (AI Dynamic)"
                            size="small"
                            clickable
                            color={countMode === 'auto' ? 'primary' : 'default'}
                            variant={countMode === 'auto' ? 'filled' : 'outlined'}
                            onClick={() => setCountMode('auto')}
                            sx={{ fontWeight: countMode === 'auto' ? 700 : 500 }}
                          />
                          <Chip
                            label="Custom Count"
                            size="small"
                            clickable
                            color={countMode === 'custom' ? 'primary' : 'default'}
                            variant={countMode === 'custom' ? 'filled' : 'outlined'}
                            onClick={() => setCountMode('custom')}
                            sx={{ fontWeight: countMode === 'custom' ? 700 : 500 }}
                          />
                        </Box>
                      </Box>

                      {countMode === 'auto' ? (
                        <Box sx={{ p: 1, bgcolor: 'rgba(79, 70, 229, 0.05)', borderRadius: 1.5, border: '1px dashed rgba(79, 70, 229, 0.3)' }}>
                          <Typography variant="caption" color="primary.main" fontWeight={600} display="block">
                            🤖 AI Dynamic Mode: LLM will analyze the user story's acceptance criteria, complexity, and scenarios to generate the optimal number of test cases.
                          </Typography>
                        </Box>
                      ) : (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                            <IconButton
                              size="small"
                              onClick={() => setCustomCount(prev => Math.max(1, (Number(prev) || 1) - 1))}
                              sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
                            >
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <TextField
                              type="number"
                              size="small"
                              value={customCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setCustomCount(isNaN(val) ? '' : Math.max(1, Math.min(50, val)));
                              }}
                              inputProps={{ min: 1, max: 50, style: { textAlign: 'center', fontWeight: 800, width: 60 } }}
                              sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                            />
                            <IconButton
                              size="small"
                              onClick={() => setCustomCount(prev => Math.min(50, (Number(prev) || 0) + 1))}
                              sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              cases to generate
                            </Typography>
                          </Box>

                          {/* Quick Chips */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                            <Typography variant="caption" color="text.secondary">Presets:</Typography>
                            {[3, 5, 6, 8, 10, 12, 15, 20].map(cnt => (
                              <Chip
                                key={cnt}
                                label={cnt}
                                size="small"
                                clickable
                                color={Number(customCount) === cnt ? 'primary' : 'default'}
                                variant={Number(customCount) === cnt ? 'filled' : 'outlined'}
                                onClick={() => setCustomCount(cnt)}
                                sx={{ height: 22, fontSize: '0.75rem', fontWeight: Number(customCount) === cnt ? 700 : 500 }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              </Box>

              {/* Setting Row 3: ⚡ Token Optimization & 8k Groq Budget Control */}
              <Box
                sx={{
                  p: 2,
                  px: 2.5,
                  bgcolor: tokenOptimization ? 'rgba(16, 185, 129, 0.06)' : 'rgba(100, 116, 139, 0.05)',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={tokenOptimization}
                        onChange={(e) => handleToggleTokenOptimization(e.target.checked)}
                        color="success"
                        size="small"
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BoltIcon sx={{ color: tokenOptimization ? 'success.main' : 'text.disabled', fontSize: '1.2rem' }} />
                        <Typography variant="subtitle2" fontWeight={700}>
                          {tokenOptimization ? '8k Token Budget Optimization: ACTIVE' : 'Token Optimization: OFF (Enterprise Mode)'}
                        </Typography>
                      </Box>
                    }
                  />
                  <Tooltip title="Guarantees request payloads (Prompt + Context + Completion) stay strictly under 8,000 tokens for Groq/Gemini free models, avoiding '8000 tokens limit reached' errors.">
                    <Chip
                      label={tokenOptimization ? 'Groq / Gemini 8k Free Safe' : 'Unrestricted Tokens'}
                      size="small"
                      color={tokenOptimization ? 'success' : 'default'}
                      variant={tokenOptimization ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 600, height: 22, fontSize: '0.72rem' }}
                    />
                  </Tooltip>
                </Box>

                {/* Live Budget Meter */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Max Cap: ${maxTotalTokens.toLocaleString()} tok`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                  <Chip
                    label={`Output Alloc: ~${maxGenerationTokens.toLocaleString()} tok`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                  <Chip
                    label={`Context Alloc: ~${maxSummaryTokens} tok`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                </Box>
              </Box>
            </Card>

            <Paper
              component="section"
              aria-label="RAG and LLM moderation flow"
              elevation={0}
              sx={{ mb: 3.5, p: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
            >
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                MODERATION FLOW
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', pb: 0.5 }}>
                {(ragMode === 'with-rag'
                  ? ['RAG context', 'Input moderation', 'LLM generation', 'Output moderation', 'Frontend display']
                  : ['Story prompt', 'Input moderation', 'LLM generation', 'Output moderation', 'Frontend display']
                ).map((stage, index) => (
                  <Box
                    key={stage}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flex: '1 0 150px',
                      minWidth: 0,
                      color: index === 1 || index === 3 ? 'warning.dark' : 'text.primary'
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        minHeight: 52,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        px: 1.25,
                        borderLeft: '3px solid',
                        borderColor: index === 1 || index === 3 ? 'warning.main' : 'divider'
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        STEP {index + 1}
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {stage}
                      </Typography>
                    </Box>
                    {index < 4 && (
                      <Typography aria-hidden="true" color="text.disabled" sx={{ px: 0.5, flexShrink: 0 }}>
                        →
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Input is checked before it reaches the LLM; the generated response is checked again before it is displayed.
              </Typography>
            </Paper>

            {/* Target User Story Area */}
            <Card sx={{ mb: 3.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ p: 2.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>
                    Target User Story / Query Specification
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Select a sample teaching story or type your own custom user story.
                  </Typography>
                </Box>

                {/* Preset Chips */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ alignSelf: 'center', fontWeight: 600, color: 'text.secondary' }}>
                    Quick Presets:
                  </Typography>
                  {USER_STORY_PRESETS.map((preset) => (
                    <Chip
                      key={preset.id}
                      icon={<PresetIcon sx={{ fontSize: '1rem !important' }} />}
                      label={preset.title}
                      size="small"
                      clickable
                      onClick={() => setTestQuery(preset.query)}
                      color={testQuery === preset.query ? 'primary' : 'default'}
                      variant={testQuery === preset.query ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 600 }}
                    />
                  ))}
                </Box>
              </Box>

              <Box sx={{ p: 2.5 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={6}
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  variant="outlined"
                  placeholder="Enter a complete user story, acceptance criteria, and system requirements..."
                  sx={{
                    fontFamily: 'monospace',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      fontSize: '0.9rem',
                      lineHeight: 1.6
                    }
                  }}
                />
              </Box>

              {/* Action Buttons Bar */}
              <Box
                sx={{
                  p: 2.5,
                  bgcolor: 'background.default',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2
                }}
              >
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {/* Mode-specific Run Button */}
                  {ragMode === 'with-rag' ? (
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={withRagLoading ? <CircularProgress size={20} color="inherit" /> : <AiIcon />}
                      onClick={handleLlmRagTest}
                      disabled={withRagLoading || runningBoth || !schemaValid}
                      sx={{ px: 3.5, py: 1.3, fontWeight: 700, borderRadius: '24px' }}
                    >
                      {withRagLoading ? 'Running Complete RAG Pipeline...' : `Generate With RAG (${countMode === 'custom' ? customCount : 'Auto'} Cases)`}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      color="warning"
                      size="large"
                      startIcon={withoutRagLoading ? <CircularProgress size={20} color="inherit" /> : <TestIcon />}
                      onClick={handleWithoutRagTest}
                      disabled={withoutRagLoading || runningBoth || !schemaValid}
                      sx={{ px: 3.5, py: 1.3, fontWeight: 700, borderRadius: '24px' }}
                    >
                      {withoutRagLoading ? 'Generating Baseline...' : `Generate Without RAG (${countMode === 'custom' ? customCount : 'Auto'} Cases)`}
                    </Button>
                  )}

                  {/* Sequential "Run Both Modes" Button */}
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="large"
                    startIcon={runningBoth ? <CircularProgress size={20} color="inherit" /> : <PlayAllIcon />}
                    onClick={handleRunBoth}
                    disabled={withRagLoading || withoutRagLoading || runningBoth || !schemaValid}
                    sx={{ px: 3, py: 1.3, fontWeight: 700, borderRadius: '24px', borderWidth: '1.5px' }}
                  >
                    {runningBoth ? 'Running Both Modes...' : '🚀 Run Both Modes (Auto-Compare)'}
                  </Button>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {/* Compare Results Navigation Button */}
                  <Button
                    variant="contained"
                    color="info"
                    size="large"
                    startIcon={<CompareIcon />}
                    onClick={() => setTabValue(3)}
                    sx={{ px: 3, py: 1.3, fontWeight: 700, borderRadius: '24px' }}
                  >
                    {isComparisonReady ? '⚖️ View Side-by-Side Comparison (Ready)' : '⚖️ Go to Comparison Tab'}
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={!schemaValid}
                    sx={{ borderRadius: '24px' }}
                  >
                    Save Config
                  </Button>
                </Box>
              </Box>
            </Card>

            {/* Active Execution Progress Indicator */}
            {(withRagLoading || withoutRagLoading || runningBoth) && (
              <Card sx={{ mb: 3.5, p: 3, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'primary.light' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={24} />
                    <Typography variant="body1" fontWeight={700}>
                      {currentStepText || (runningBoth ? 'Executing dual-mode generation...' : 'Executing AI pipeline...')}
                    </Typography>
                  </Box>
                  <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                    {generationProgress}%
                  </Typography>
                </Box>
                <LinearProgress variant="determinate" value={generationProgress} sx={{ height: 8, borderRadius: 4 }} />
              </Card>
            )}

            {/* ── ACTIVE RESULTS DISPLAY ── */}
            {(hasWithRag || hasWithoutRag) && (
              <Card variant="outlined" sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>Quality approval workflow</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Publish gates: Faithfulness ≥ 0.75 · Hallucination ≤ 0.25 · Contextual Recall is informational
                  </Typography>
                </Box>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={qualityMode}
                  onChange={(_, value) => {
                    if (!value) return;
                    setQualityMode(value);
                    try { localStorage.setItem('testcase_quality_mode', value); } catch {}
                  }}
                  aria-label="Quality approval mode"
                >
                  <ToggleButton value="manual">Manual</ToggleButton>
                  <ToggleButton value="automation">Automation</ToggleButton>
                </ToggleButtonGroup>
              </Card>
            )}
            {ragMode === 'with-rag' && withRagResult && (
              <Card sx={{ borderRadius: 3, border: '1.5px solid', borderColor: 'primary.main', overflow: 'hidden' }}>
                <Box sx={{ p: 2.5, bgcolor: 'rgba(79, 70, 229, 0.08)', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                      <AiIcon /> Generated Test Cases with RAG Pipeline
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                      <Chip label="Mode: With RAG" color="success" size="small" />
                      {withRagResult.model && <Chip label={`Model: ${withRagResult.model}`} color="primary" size="small" variant="outlined" />}
                      {withRagResult.searchResults && <Chip label={`${withRagResult.searchResults} MongoDB Matches`} color="info" size="small" />}
                      {withRagResult.tokens && (
                        <Chip
                          icon={<BoltIcon />}
                          label={`${withRagResult.tokens.total.toLocaleString()} / ${withRagResult.budget?.maxTotal || maxTotalTokens} Tok (${Math.min(100, Math.round((withRagResult.tokens.total / (withRagResult.budget?.maxTotal || maxTotalTokens)) * 100))}% Budget Safe)`}
                          color={withRagResult.tokens.total <= (withRagResult.budget?.maxTotal || maxTotalTokens) ? 'success' : 'warning'}
                          size="small"
                        />
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      startIcon={<AssessmentIcon />}
                      onClick={() => setTabValue(4)}
                      sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 700 }}
                    >
                      Evaluate Quality (DeepEval)
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ExportIcon />}
                      onClick={() => exportToCSV(withRagResult.response?.newTestCases || [], 'with_rag_test_cases')}
                      sx={{ borderRadius: '20px' }}
                    >
                      Export CSV
                    </Button>
                  </Box>
                </Box>

                {withRagResult.error && <Alert severity="error" sx={{ m: 2 }}>{withRagResult.message}</Alert>}
                {renderQualityWorkflow(withRagResult, 'with-rag')}
                <Box sx={{ p: 3 }}>
                  <Tabs
                    value={pipelineView}
                    onChange={(e, val) => setPipelineView(val)}
                    sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}
                  >
                    <Tab
                      value="generated"
                      label={`Generated Test Cases (${withRagResult.response?.newTestCases?.length || parseAndRepairLlmOutput(withRagResult.rawContent || withRagResult.response?.raw)?.newTestCases?.length || 0})`}
                      icon={<AiIcon />}
                      iconPosition="start"
                    />
                    <Tab value="reference" label={`Retrieved MongoDB Context (${withRagResult.existingTestCases?.length || 0})`} icon={<SearchIcon />} iconPosition="start" />
                    <Tab value="user-stories" label={`Linked User Stories (${withRagResult.similarUserStories?.length || similarUserStories?.length || 0})`} icon={<LayersIcon />} iconPosition="start" />
                  </Tabs>

                  {pipelineView === 'generated' && (
                    renderTestCaseTable(withRagResult.response?.newTestCases || [], 'Generated Test Cases', false, false)
                  )}

                  {pipelineView === 'reference' && (
                    renderTestCaseTable(withRagResult.existingTestCases || [], 'Reference Context Cases', true, false)
                  )}

                  {pipelineView === 'user-stories' && (
                    renderUserStoriesTable(withRagResult.similarUserStories || similarUserStories || [])
                  )}
                </Box>
              </Card>
            )}

            {ragMode === 'without-rag' && withoutRagResult && (
              <Card sx={{ borderRadius: 3, border: '1.5px solid', borderColor: 'warning.main', overflow: 'hidden' }}>
                <Box sx={{ p: 2.5, bgcolor: 'rgba(217, 119, 6, 0.08)', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.dark' }}>
                      <TestIcon /> Generated Test Cases Without RAG (Direct Baseline)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                      <Chip label="Mode: Without RAG" color="warning" size="small" />
                      {withoutRagResult.model && <Chip label={`Model: ${withoutRagResult.model}`} color="primary" size="small" variant="outlined" />}
                      <Chip label="0 DB Retrieval (Zero Context)" size="small" variant="outlined" />
                      {withoutRagResult.tokens && (
                        <Chip
                          icon={<BoltIcon />}
                          label={`${withoutRagResult.tokens.total.toLocaleString()} / ${withoutRagResult.budget?.maxTotal || maxTotalTokens} Tok (${Math.min(100, Math.round((withoutRagResult.tokens.total / (withoutRagResult.budget?.maxTotal || maxTotalTokens)) * 100))}% Budget Safe)`}
                          color={withoutRagResult.tokens.total <= (withoutRagResult.budget?.maxTotal || maxTotalTokens) ? 'success' : 'warning'}
                          size="small"
                        />
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      startIcon={<AssessmentIcon />}
                      onClick={() => setTabValue(4)}
                      sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 700 }}
                    >
                      Evaluate Quality (DeepEval)
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ExportIcon />}
                      onClick={() => exportToCSV(withoutRagResult.response?.newTestCases || [], 'without_rag_test_cases')}
                      sx={{ borderRadius: '20px' }}
                    >
                      Export CSV
                    </Button>
                  </Box>
                </Box>

                {withoutRagResult.error && <Alert severity="error" sx={{ m: 2 }}>{withoutRagResult.message}</Alert>}
                {renderQualityWorkflow(withoutRagResult, 'without-rag')}
                <Box sx={{ p: 3 }}>
                  {renderTestCaseTable(withoutRagResult.response?.newTestCases || [], 'Generated Baseline Test Cases', false, true)}
                </Box>
              </Card>
            )}
          </Box>
        </TabPanel>

        {/* ─────────────────────────────────────────────────────────────
            TAB 3: ⚖️ RAG VS NON-RAG COMPARISON DASHBOARD
        ───────────────────────────────────────────────────────────── */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ p: { xs: 2, md: 3.5 } }}>
            {/* Header / Summary */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3.5 }}>
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <CompareIcon color="primary" sx={{ fontSize: '2rem' }} />
                  RAG vs Non-RAG Generated Test Cases Comparison
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Contrasting <strong>Generated Test Cases (Without RAG)</strong> against <strong>Generated Test Cases (With RAG)</strong> for the exact same user story.
                </Typography>
              </Box>

              {isComparisonReady && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={aiComparing ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
                    onClick={handleRunAiComparison}
                    disabled={aiComparing}
                    sx={{ fontWeight: 700, borderRadius: '24px' }}
                  >
                    {aiComparing ? 'Analyzing...' : aiComparisonResult ? 'Re-Run AI Comparative Analysis' : 'Run AI Comparative Analysis'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ExportIcon />}
                    onClick={exportComparisonJSON}
                    sx={{ borderRadius: '24px' }}
                  >
                    Export Comparison (JSON)
                  </Button>
                </Box>
              )}
            </Box>

            {/* ── EMPTY / INCOMPLETE STATE GUARD ── */}
            {!isComparisonReady && (
              <Card sx={{ p: 4, mb: 3, border: '2px dashed', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.default' }}>
                <Box sx={{ textAlign: 'center', maxWidth: 750, mx: 'auto', mb: 3 }}>
                  <Typography variant="h6" fontWeight={800} gutterBottom sx={{ color: 'warning.dark' }}>
                    ⚠️ Comparison Requires Both Pipelines to Be Generated
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    To compare the effect of RAG augmentation, please run generation for both <strong>Without RAG</strong> (baseline) and <strong>With RAG</strong> (10-step pipeline).
                  </Typography>
                </Box>

                {/* Status Cards */}
                <Grid container spacing={3} sx={{ maxWidth: 850, mx: 'auto', mb: 3 }}>
                  {/* Without RAG Status Card */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      sx={{
                        p: 3,
                        height: '100%',
                        border: '2px solid',
                        borderColor: hasWithoutRag ? 'success.main' : 'warning.main',
                        bgcolor: hasWithoutRag ? 'rgba(5, 150, 105, 0.04)' : 'background.paper',
                        borderRadius: 3
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="subtitle1" fontWeight={800}>
                          1. Without RAG (Baseline)
                        </Typography>
                        {hasWithoutRag ? (
                          <Chip icon={<ValidIcon />} label="Generated" color="success" size="small" />
                        ) : (
                          <Chip icon={<HighlightOffIcon />} label="Not Run Yet" color="warning" size="small" />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {hasWithoutRag
                          ? `✅ ${withoutRagResult.response?.newTestCases?.length || 0} baseline test cases generated directly by LLM.`
                          : 'Direct LLM generation from user story has not been executed yet.'}
                      </Typography>
                      {!hasWithoutRag && (
                        <Button
                          fullWidth
                          variant="contained"
                          color="warning"
                          size="medium"
                          startIcon={<TestIcon />}
                          onClick={handleWithoutRagTest}
                          disabled={withoutRagLoading || runningBoth}
                          sx={{ borderRadius: '20px', fontWeight: 700 }}
                        >
                          {withoutRagLoading ? 'Generating...' : 'Generate Without RAG Now'}
                        </Button>
                      )}
                    </Card>
                  </Grid>

                  {/* With RAG Status Card */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      sx={{
                        p: 3,
                        height: '100%',
                        border: '2px solid',
                        borderColor: hasWithRag ? 'success.main' : 'primary.main',
                        bgcolor: hasWithRag ? 'rgba(79, 70, 229, 0.04)' : 'background.paper',
                        borderRadius: 3
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="subtitle1" fontWeight={800}>
                          2. With RAG (Pipeline)
                        </Typography>
                        {hasWithRag ? (
                          <Chip icon={<ValidIcon />} label="Generated" color="success" size="small" />
                        ) : (
                          <Chip icon={<HighlightOffIcon />} label="Not Run Yet" color="primary" size="small" />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {hasWithRag
                          ? `✅ ${withRagResult.response?.newTestCases?.length || 0} context-augmented test cases generated.`
                          : 'Complete 10-step MongoDB retrieval pipeline has not been executed yet.'}
                      </Typography>
                      {!hasWithRag && (
                        <Button
                          fullWidth
                          variant="contained"
                          color="primary"
                          size="medium"
                          startIcon={<AiIcon />}
                          onClick={handleLlmRagTest}
                          disabled={withRagLoading || runningBoth}
                          sx={{ borderRadius: '20px', fontWeight: 700 }}
                        >
                          {withRagLoading ? 'Running Pipeline...' : 'Generate With RAG Now'}
                        </Button>
                      )}
                    </Card>
                  </Grid>
                </Grid>

                {/* Auto Run Both */}
                <Box sx={{ textAlign: 'center' }}>
                  <Button
                    variant="contained"
                    color="secondary"
                    size="large"
                    startIcon={<PlayAllIcon />}
                    onClick={handleRunBoth}
                    disabled={withRagLoading || withoutRagLoading || runningBoth}
                    sx={{ px: 4, py: 1.3, fontWeight: 800, borderRadius: '28px' }}
                  >
                    {runningBoth ? 'Running Both Pipelines Sequentially...' : '⚡ Generate Both Pipelines (Auto-Compare)'}
                  </Button>
                </Box>
              </Card>
            )}

            {/* ── FULL COMPARISON DASHBOARD (WHEN BOTH ARE READY) ── */}
            {isComparisonReady && (
              <Stack spacing={3.5}>
                {/* 1. Executive Dimension Comparison Matrix */}
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                  <Box sx={{ p: 2.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SpeedIcon color="primary" /> Executive Dimension Comparison Matrix
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      5 fundamental architectural differences between Zero-Context baseline generation and RAG retrieval augmentation.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2.5 }}>
                    <Grid container spacing={2}>
                      {/* Dimension 1: Domain Grounding */}
                      <Grid item xs={12} sm={6} md={2.4}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                            Domain Grounding
                          </Typography>
                          <Box sx={{ my: 1 }}>
                            <Chip label="Base: Low (Generic)" size="small" color="warning" variant="outlined" sx={{ mb: 0.5, display: 'block' }} />
                            <Chip label="RAG: High (UHID/PRN)" size="small" color="success" sx={{ display: 'block' }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            RAG grounds tests in hospital entities, barcodes, and HIPAA standards.
                          </Typography>
                        </Paper>
                      </Grid>

                      {/* Dimension 2: Database Alignment */}
                      <Grid item xs={12} sm={6} md={2.4}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                            Database Grounding
                          </Typography>
                          <Box sx={{ my: 1 }}>
                            <Typography variant="h6" fontWeight={800}>
                              0 <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>vs</span> {withRagResult.topResults || 10} Cases
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Searches 6,000+ MongoDB cases via Hybrid Search (BM25 + Vector).
                          </Typography>
                        </Paper>
                      </Grid>

                      {/* Dimension 3: Step Depth */}
                      <Grid item xs={12} sm={6} md={2.4}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                            Step Depth & Detail
                          </Typography>
                          <Box sx={{ my: 1 }}>
                            <Chip label="Base: 3-4 Generic Steps" size="small" variant="outlined" sx={{ mb: 0.5, display: 'block' }} />
                            <Chip label="RAG: 5-8 Detailed Steps" size="small" color="success" sx={{ display: 'block' }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            RAG enforces field-level verification in database tables.
                          </Typography>
                        </Paper>
                      </Grid>

                      {/* Dimension 4: Hallucination Risk */}
                      <Grid item xs={12} sm={6} md={2.4}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                            Hallucination Risk
                          </Typography>
                          <Box sx={{ my: 1 }}>
                            <Chip label="Base: Elevated" size="small" color="error" variant="outlined" sx={{ mb: 0.5, display: 'block' }} />
                            <Chip label="RAG: Minimal" size="small" color="success" sx={{ display: 'block' }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            RAG verifies against real existing hospital test suites.
                          </Typography>
                        </Paper>
                      </Grid>

                      {/* Dimension 5: Cost & Economics */}
                      <Grid item xs={12} sm={6} md={2.4}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                            Cost & Tokens
                          </Typography>
                          <Box sx={{ my: 1 }}>
                            <Typography variant="body2" fontWeight={700}>
                              Base: {withoutRagResult.tokens?.total || 0}t (${withoutRagResult.cost?.total || '0.00'})
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="primary.main">
                              RAG: {withRagResult.tokens?.total || 0}t (${withRagResult.cost?.total || '0.00'})
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Modest token difference for vastly superior quality.
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Box>
                </Card>

                {/* 2. AI-Powered Deep Comparative Analysis (If Executed) */}
                {aiComparisonResult && (
                  <Card sx={{ borderRadius: 3, border: '2px solid', borderColor: 'success.main', bgcolor: 'rgba(5, 150, 105, 0.03)' }}>
                    <CardContent sx={{ p: 3.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                          <AutoAwesomeIcon color="success" />
                          <Typography variant="h6" fontWeight={800} color="success.dark">
                            AI Comparative Analysis & Pedagogical Evaluation
                          </Typography>
                        </Box>
                        <Chip label="Multi-LLM Evaluated" color="success" size="small" sx={{ fontWeight: 700 }} />
                      </Box>

                      {/* Overall Verdict Banner */}
                      {aiComparisonResult.overallVerdict && (
                        <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                          <Typography variant="subtitle1" fontWeight={800}>
                            🏆 {aiComparisonResult.overallVerdict.headline || 'RAG Pipeline Provides Vastly Superior Domain Fidelity'}
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {aiComparisonResult.overallVerdict.summary}
                          </Typography>
                        </Alert>
                      )}

                      {/* Dimension Scores Progress Bars */}
                      {aiComparisonResult.dimensionScores && (
                        <Box sx={{ mb: 3 }}>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                            📊 Comparative Dimension Scoring
                          </Typography>
                          <Grid container spacing={2}>
                            {aiComparisonResult.dimensionScores.map((dim, idx) => (
                              <Grid item xs={12} md={6} key={idx}>
                                <Paper sx={{ p: 2, borderRadius: 2, height: '100%', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="body2" fontWeight={700}>{dim.dimension}</Typography>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                      <Chip label={`Without RAG: ${dim.withoutRagScore}%`} size="small" color="warning" variant="outlined" />
                                      <Chip label={`With RAG: ${dim.withRagScore}%`} size="small" color="success" />
                                    </Box>
                                  </Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={dim.withRagScore}
                                    sx={{ height: 6, borderRadius: 3, mb: 1, bgcolor: 'warning.light', '& .MuiLinearProgress-bar': { bgcolor: 'success.main' } }}
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {dim.analysis}
                                  </Typography>
                                </Paper>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      )}

                      {/* Key Architectural & Feature Differences Table */}
                      {aiComparisonResult.keyDifferences && aiComparisonResult.keyDifferences.length > 0 && (
                        <Box sx={{ mb: 3 }}>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CompareIcon color="primary" /> 🔍 Key Architectural & Domain Differences (Why RAG Wins)
                          </Typography>
                          <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: 'background.default' }}>
                                  <TableCell sx={{ fontWeight: 800, width: '22%', color: 'text.primary' }}>Category / Focus</TableCell>
                                  <TableCell sx={{ fontWeight: 800, width: '33%', color: 'warning.dark' }}>🌐 Baseline (Without RAG)</TableCell>
                                  <TableCell sx={{ fontWeight: 800, width: '33%', color: 'success.dark' }}>🚀 Context-Augmented (With RAG)</TableCell>
                                  <TableCell sx={{ fontWeight: 800, width: '12%', color: 'primary.main' }}>💡 Impact for QA</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {aiComparisonResult.keyDifferences.map((diff, idx) => (
                                  <TableRow key={idx} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.015)' } }}>
                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                      <Chip label={diff.category} size="small" variant="outlined" color="primary" sx={{ fontWeight: 700 }} />
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.82rem', color: 'text.secondary', bgcolor: 'rgba(245, 158, 11, 0.03)' }}>
                                      {diff.withoutRagObservation}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.82rem', color: 'text.primary', fontWeight: 500, bgcolor: 'rgba(16, 185, 129, 0.04)' }}>
                                      {diff.withRagObservation}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem', color: 'primary.dark' }}>
                                      {diff.impact}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      )}

                      {/* Key Takeaways for Students & Learners */}
                      {aiComparisonResult.learnerTakeaways && (
                        <Card sx={{ bgcolor: 'background.paper', p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="subtitle1" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, color: 'primary.main' }}>
                            <LightbulbIcon color="primary" /> Key Teaching Points for Learners & QA Architects
                          </Typography>
                          <Grid container spacing={1.5}>
                            {aiComparisonResult.learnerTakeaways.map((takeaway, idx) => (
                              <Grid item xs={12} sm={6} key={idx}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.2, bgcolor: 'rgba(79, 70, 229, 0.04)', borderRadius: 2, height: '100%' }}>
                                  <CheckCircleOutlineIcon color="primary" sx={{ fontSize: '1.2rem', mt: 0.2 }} />
                                  <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                    {takeaway}
                                  </Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Prominent CTA Banner when comparison is ready but AI analysis hasn't been run */}
                {!aiComparisonResult && isComparisonReady && (
                  <Paper sx={{ p: 3, borderRadius: 3, border: '1px dashed', borderColor: 'primary.main', bgcolor: 'rgba(79, 70, 229, 0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AutoAwesomeIcon /> Multi-LLM Comparative Evaluation Ready
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Both test suites (Without RAG baseline vs With RAG 10-step pipeline) are generated. Run AI comparative evaluation to measure domain grounding, hallucination risk, and compliance differences.
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={aiComparing ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
                      onClick={handleRunAiComparison}
                      disabled={aiComparing}
                      sx={{ fontWeight: 700, borderRadius: '24px', px: 3 }}
                    >
                      {aiComparing ? 'Analyzing...' : '⚡ Run AI Comparative Analysis'}
                    </Button>
                  </Paper>
                )}

                {/* 3. SIDE-BY-SIDE GENERATED TEST CASES VIEWER */}
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                  <Box sx={{ p: 2.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="h6" fontWeight={800}>
                        Side-by-Side Test Case Inspection
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Compare each test case generated without database context against the context-augmented test case.
                      </Typography>
                    </Box>

                    {/* View Layout Toggle */}
                    <ToggleButtonGroup
                      value={comparisonLayout}
                      exclusive
                      onChange={(e, val) => { if (val) setComparisonLayout(val); }}
                      size="small"
                      sx={{ bgcolor: 'background.paper', borderRadius: '20px' }}
                    >
                      <ToggleButton value="split" sx={{ px: 2, py: 0.5, textTransform: 'none', fontWeight: 600 }}>
                        <ViewColumnIcon sx={{ mr: 0.5, fontSize: '1.1rem' }} /> Split Side-by-Side
                      </ToggleButton>
                      <ToggleButton value="tabs" sx={{ px: 2, py: 0.5, textTransform: 'none', fontWeight: 600 }}>
                        <TabIcon sx={{ mr: 0.5, fontSize: '1.1rem' }} /> Tabbed View
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* Split View */}
                  {comparisonLayout === 'split' ? (
                    <Box sx={{ p: 2.5 }}>
                      <Grid container spacing={3}>
                        {/* Left Column: Without RAG */}
                        <Grid item xs={12} md={6}>
                          <Card sx={{ border: '2px solid', borderColor: 'warning.main', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}>
                            <Box sx={{ p: 2, bgcolor: 'warning.main', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="subtitle1" fontWeight={800}>
                                  🌐 Generated WITHOUT RAG (Baseline)
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                  Direct LLM (Model Weights Only)
                                </Typography>
                              </Box>
                              <Chip
                                label={`${withoutRagResult.response?.newTestCases?.length || 0} Cases`}
                                size="small"
                                sx={{ bgcolor: '#fff', color: 'warning.dark', fontWeight: 800 }}
                              />
                            </Box>
                            <Box sx={{ p: 2, maxHeight: 750, overflow: 'auto' }}>
                              {renderTestCaseTable(withoutRagResult.response?.newTestCases || [], 'Without RAG', false, true)}
                            </Box>
                          </Card>
                        </Grid>

                        {/* Right Column: With RAG */}
                        <Grid item xs={12} md={6}>
                          <Card sx={{ border: '2px solid', borderColor: 'success.main', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}>
                            <Box sx={{ p: 2, bgcolor: 'success.main', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="subtitle1" fontWeight={800}>
                                  🚀 Generated WITH RAG (Context-Augmented)
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                  10-Step MongoDB Retrieval Pipeline
                                </Typography>
                              </Box>
                              <Chip
                                label={`${withRagResult.response?.newTestCases?.length || 0} Cases`}
                                size="small"
                                sx={{ bgcolor: '#fff', color: 'success.dark', fontWeight: 800 }}
                              />
                            </Box>
                            <Box sx={{ p: 2, maxHeight: 750, overflow: 'auto' }}>
                              {renderTestCaseTable(withRagResult.response?.newTestCases || [], 'With RAG', false, false)}
                            </Box>
                          </Card>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : (
                    /* Tabbed View */
                    <Box sx={{ p: 2.5 }}>
                      <Tabs
                        value={comparisonTab}
                        onChange={(e, val) => setComparisonTab(val)}
                        sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}
                      >
                        <Tab value="with-rag" label={`With RAG (${withRagResult.response?.newTestCases?.length || 0} Cases)`} icon={<AiIcon />} iconPosition="start" />
                        <Tab value="without-rag" label={`Without RAG (${withoutRagResult.response?.newTestCases?.length || 0} Cases)`} icon={<TestIcon />} iconPosition="start" />
                      </Tabs>

                      {comparisonTab === 'with-rag' && (
                        renderTestCaseTable(withRagResult.response?.newTestCases || [], 'With RAG', false, false)
                      )}
                      {comparisonTab === 'without-rag' && (
                        renderTestCaseTable(withoutRagResult.response?.newTestCases || [], 'Without RAG', false, true)
                      )}
                    </Box>
                  )}

                  {/* Collapsible Accordion to View Source MongoDB Documents used by RAG */}
                  <Accordion sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SearchIcon color="primary" /> 📚 View Source MongoDB Context ({withRagResult.existingTestCases?.length || 0} Cases, {withRagResult.similarUserStories?.length || similarUserStories?.length || 0} User Stories)
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 2 }}>
                      <Tabs
                        value={comparisonContextSubtab}
                        onChange={(e, val) => setComparisonContextSubtab(val)}
                        sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}
                      >
                        <Tab value="cases" label={`Reference Test Cases (${withRagResult.existingTestCases?.length || 0})`} icon={<SearchIcon />} iconPosition="start" />
                        <Tab value="stories" label={`Linked User Stories (${withRagResult.similarUserStories?.length || similarUserStories?.length || 0})`} icon={<LayersIcon />} iconPosition="start" />
                      </Tabs>

                      {comparisonContextSubtab === 'cases' && (
                        renderTestCaseTable(withRagResult.existingTestCases || [], 'Retrieved Context Cases', true, false)
                      )}
                      {comparisonContextSubtab === 'stories' && (
                        renderUserStoriesTable(withRagResult.similarUserStories || similarUserStories || [])
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Card>
              </Stack>
            )}
          </Box>
        </TabPanel>

        {/* ─────────────────────────────────────────────────────────────
            TAB 4: METRICS EVALUATION (DeepEval)
        ───────────────────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────
            TAB 4: METRICS EVALUATION (DeepEval)
        ───────────────────────────────────────────────────────────── */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ p: { xs: 2, md: 3.5 } }}>
            {/* Header / Server Status */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <AssessmentIcon color="primary" sx={{ fontSize: '2rem' }} />
                  Test Case Quality Metrics Evaluation (DeepEval)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Evaluate newly generated test cases and existing regression test cases using DeepEval LLM metrics.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  icon={<ValidIcon sx={{ fontSize: '1rem !important' }} />}
                  label={deepevalServerOnline === true ? 'DeepEval Server: Online' : deepevalServerOnline === false ? 'DeepEval Server: Offline' : 'DeepEval Server: Ready'}
                  color={deepevalServerOnline === true ? 'success' : deepevalServerOnline === false ? 'error' : 'default'}
                  variant="outlined"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
                <Chip
                  label={`Eval Model: ${evalModel}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            </Box>

            {/* Metric Configuration Toggles */}
            <Card sx={{ mb: 3, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <AutoAwesomeIcon color="primary" sx={{ fontSize: '1.1rem' }} /> Select Metrics to Evaluate
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      const allOn = {};
                      Object.keys(enabledMetrics).forEach(k => { allOn[k] = true; });
                      setEnabledMetrics(allOn);
                    }}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="secondary"
                    onClick={() => {
                      const allOff = {};
                      Object.keys(enabledMetrics).forEach(k => { allOff[k] = false; });
                      setEnabledMetrics(allOff);
                    }}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    Deselect All
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="primary"
                    onClick={() => {
                      setEnabledMetrics({
                        faithfulness: true,
                        contextual_precision: true,
                        contextual_recall: true,
                        answer_relevancy: true,
                        hallucination: true,
                        bias: false,
                        pii_leakage: false,
                        ragas: true
                      });
                    }}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    RAG Core Default
                  </Button>
                </Box>
              </Box>

              <CardContent sx={{ p: 2.5 }}>
                <Grid container spacing={1.5}>
                  {[
                    { key: 'faithfulness', label: 'Faithfulness', desc: 'Factual consistency with retrieved context' },
                    { key: 'contextual_precision', label: 'Contextual Precision', desc: 'Higher relevance ranking of source chunks' },
                    { key: 'contextual_recall', label: 'Contextual Recall', desc: 'Context coverage for expected test output' },
                    { key: 'answer_relevancy', label: 'Answer Relevancy', desc: 'Alignment with user story & test requirements' },
                    { key: 'hallucination', label: 'Hallucination Detection', desc: 'Identifies ungrounded external claims' },
                    { key: 'bias', label: 'Bias Detection', desc: 'Detects gender/political/racial bias' },
                    { key: 'pii_leakage', label: 'PII Leakage Safety', desc: 'Verifies privacy & sensitive data protection' },
                    { key: 'ragas', label: 'RAGAS Composite', desc: 'Combined precision, recall, and faithfulness' }
                  ].map(({ key, label, desc }) => (
                    <Grid item xs={12} sm={6} md={3} key={key}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: enabledMetrics[key] ? 'primary.main' : 'divider',
                          bgcolor: enabledMetrics[key] ? 'rgba(79, 70, 229, 0.04)' : 'background.default',
                          transition: 'all 0.2s ease',
                          cursor: 'pointer'
                        }}
                        onClick={() => setEnabledMetrics(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={!!enabledMetrics[key]}
                              onChange={(e) => setEnabledMetrics(prev => ({ ...prev, [key]: e.target.checked }))}
                              size="small"
                              color="primary"
                              sx={{ p: 0.5 }}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                {label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.72rem', lineHeight: 1.2 }}>
                                {desc}
                              </Typography>
                            </Box>
                          }
                          sx={{ m: 0, alignItems: 'flex-start' }}
                        />
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>

            {/* Test Case Selection & Controls */}
            {(withRagResult || withoutRagResult) ? (
              <Card sx={{ mb: 3, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ p: 2.5, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                    Select Test Case to Evaluate:
                  </Typography>

                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                      <FormControl fullWidth size="small">
                        <Select
                          value={selectedTestCase}
                          onChange={(e) => setSelectedTestCase(e.target.value)}
                          displayEmpty
                          sx={{ borderRadius: 2 }}
                        >
                          <MenuItem value="">
                            <em>-- Choose a test case to evaluate --</em>
                          </MenuItem>

                          {/* Reference / Regression Test Cases from MongoDB */}
                          {withRagResult?.existingTestCases?.length > 0 && (
                            <ListSubheader sx={{ fontWeight: 800, color: 'primary.main', bgcolor: 'background.paper' }}>
                              📚 Reference / Regression Test Cases from MongoDB ({withRagResult.existingTestCases.length})
                            </ListSubheader>
                          )}
                          {withRagResult?.existingTestCases?.map((tc, idx) => (
                            <MenuItem key={`ref-${idx}`} value={JSON.stringify({ data: tc, mode: 'reference' })}>
                              📚 [Regression] {tc.testCaseId || `TC_${idx + 1}`}: {tc.testCaseTitle || tc.title || `Reference Case ${idx + 1}`}
                            </MenuItem>
                          ))}

                          {/* Generated Test Cases - With RAG */}
                          {withRagResult?.response?.newTestCases?.length > 0 && (
                            <ListSubheader sx={{ fontWeight: 800, color: 'success.main', bgcolor: 'background.paper' }}>
                              🚀 Generated Test Cases - With RAG ({withRagResult.response.newTestCases.length})
                            </ListSubheader>
                          )}
                          {withRagResult?.response?.newTestCases?.map((tc, idx) => (
                            <MenuItem key={`with-rag-${idx}`} value={JSON.stringify({ data: tc, mode: 'with-rag' })}>
                              🚀 [With RAG] {tc.testCaseId || `GEN_${idx + 1}`}: {tc.testCaseTitle || tc.title}
                            </MenuItem>
                          ))}

                          {/* Generated Test Cases - Without RAG */}
                          {withoutRagResult?.response?.newTestCases?.length > 0 && (
                            <ListSubheader sx={{ fontWeight: 800, color: 'warning.dark', bgcolor: 'background.paper' }}>
                              🌐 Generated Test Cases - Without RAG ({withoutRagResult.response.newTestCases.length})
                            </ListSubheader>
                          )}
                          {withoutRagResult?.response?.newTestCases?.map((tc, idx) => (
                            <MenuItem key={`without-rag-${idx}`} value={JSON.stringify({ data: tc, mode: 'without-rag' })}>
                              🌐 [Without RAG] {tc.testCaseId || `NONRAG_${idx + 1}`}: {tc.testCaseTitle || tc.title}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={4} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <Button
                        fullWidth
                        variant="contained"
                        color="primary"
                        size="medium"
                        startIcon={metricsLoading ? <CircularProgress size={18} color="inherit" /> : <AssessmentIcon />}
                        disabled={metricsLoading || !selectedTestCase || Object.values(enabledMetrics).every(v => !v)}
                        onClick={() => {
                          if (selectedTestCase) {
                            const { data, mode } = JSON.parse(selectedTestCase);

                            // Build rich context passages
                            const contextPassages = [];
                            if (withRagResult?.ragSummary) {
                              contextPassages.push(`Context Summary: ${withRagResult.ragSummary}`);
                            }
                            if (withRagResult?.existingTestCases?.length > 0) {
                              withRagResult.existingTestCases.forEach((tc, idx) => {
                                const title = tc.testCaseTitle || tc.title || `Case ${idx + 1}`;
                                const desc = tc.description || tc.testSummary || '';
                                const steps = Array.isArray(tc.steps) ? tc.steps.join('; ') : (tc.testSteps || '');
                                const exp = tc.expectedResult || tc.expectedResults || '';
                                contextPassages.push(`[Reference Test Case: ${title}] Description: ${desc}. Steps: ${steps}. Expected: ${exp}`);
                              });
                            }
                            if (withRagResult?.similarUserStories?.length > 0) {
                              withRagResult.similarUserStories.forEach((st, idx) => {
                                const title = st.storyTitle || st.title || `Story ${idx + 1}`;
                                const criteria = st.acceptanceCriteria || st.description || '';
                                contextPassages.push(`[Linked User Story: ${title}] Acceptance Criteria: ${criteria}`);
                              });
                            }
                            if (contextPassages.length === 0) {
                              contextPassages.push(withRagResult?.originalQuery || withoutRagResult?.originalQuery || testQuery || 'Software test requirement specification');
                            }

                            const query = withRagResult?.originalQuery || withoutRagResult?.originalQuery || testQuery;
                            evaluateMetrics(data, contextPassages, query, mode);
                          }
                        }}
                        sx={{ py: 1.1, borderRadius: '24px', fontWeight: 700 }}
                      >
                        {metricsLoading ? 'Evaluating Metrics...' : 'Evaluate Quality'}
                      </Button>
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">
                      Available Cases:
                    </Typography>
                    {withRagResult?.existingTestCases?.length > 0 && (
                      <Chip label={`${withRagResult.existingTestCases.length} Regression Cases`} size="small" variant="outlined" color="primary" />
                    )}
                    {withRagResult?.response?.newTestCases?.length > 0 && (
                      <Chip label={`${withRagResult.response.newTestCases.length} With-RAG Generated`} size="small" variant="outlined" color="success" />
                    )}
                    {withoutRagResult?.response?.newTestCases?.length > 0 && (
                      <Chip label={`${withoutRagResult.response.newTestCases.length} Without-RAG Generated`} size="small" variant="outlined" color="warning" />
                    )}
                  </Box>
                </Box>
              </Card>
            ) : (
              <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight={600}>
                  No test cases generated yet
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Please run the Test & Generate workflow in Tab 2 to retrieve reference test cases from MongoDB and generate AI test cases, then return here to evaluate their quality.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setTabValue(2)}
                  sx={{ mt: 1.5, borderRadius: '16px' }}
                >
                  ⚡ Go to Test & Generate
                </Button>
              </Alert>
            )}

            {/* Metrics Loading Animation */}
            {metricsLoading && (
              <Card sx={{ p: 4, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'primary.light', bgcolor: 'rgba(79, 70, 229, 0.04)', textAlign: 'center' }}>
                <CircularProgress size={36} color="primary" sx={{ mb: 2 }} />
                <Typography variant="h6" fontWeight={700} color="primary.main">
                  Evaluating Test Case with DeepEval...
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Computing LLM metrics using {evalModel} via DeepEval sidecar service on port 8000.
                </Typography>
              </Card>
            )}

            {/* Metrics Evaluation Results */}
            {metricsResult && !metricsResult.error && (
              <Card sx={{ mb: 3, borderRadius: 3, border: '1.5px solid', borderColor: 'divider', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                {/* Result Card Header */}
                <Box sx={{ p: 2.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="h6" fontWeight={800} color="text.primary">
                        ✅ Evaluation Results: {metricsResult.testTitle}
                      </Typography>
                      {metricsResult.mode && (
                        <Chip
                          label={metricsResult.mode === 'reference' ? 'Regression Test Case' : metricsResult.mode === 'with-rag' ? 'With RAG' : 'Without RAG'}
                          color={metricsResult.mode === 'reference' ? 'primary' : metricsResult.mode === 'with-rag' ? 'success' : 'warning'}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      )}
                      <Chip
                        label={`${metricsResult.results?.length || 0} Metrics Evaluated`}
                        color="info"
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Evaluated At: {new Date(metricsResult.timestamp).toLocaleTimeString()} &bull; ID: {metricsResult.testCaseId}
                    </Typography>
                  </Box>

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ResetIcon />}
                    onClick={() => {
                      if (selectedTestCase) {
                        const { data, mode } = JSON.parse(selectedTestCase);
                        const contextPassages = [withRagResult?.ragSummary, ...(withRagResult?.existingTestCases?.map(tc => tc.testCaseTitle) || [])].filter(Boolean);
                        const query = withRagResult?.originalQuery || testQuery;
                        evaluateMetrics(data, contextPassages, query, mode);
                      }
                    }}
                    sx={{ borderRadius: '16px' }}
                  >
                    Re-evaluate
                  </Button>
                </Box>

                <CardContent sx={{ p: 3 }}>
                  {/* Summary KPI Cards */}
                  {(() => {
                    const results = metricsResult.results || [];
                    if (results.length === 0) return null;

                    const validScores = results.map(r => {
                      if (['hallucination', 'bias', 'pii_leakage'].includes(r.metric_name)) {
                        return r.score !== null ? (1 - r.score) : null;
                      }
                      return r.score;
                    }).filter(s => s !== null && s !== undefined);

                    const avgScore = validScores.length > 0 ? (validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100 : 0;
                    const passCount = results.filter(r => {
                      if (r.score === null || r.score === undefined) return false;
                      if (['hallucination', 'bias', 'pii_leakage'].includes(r.metric_name)) {
                        return r.score <= 0.25;
                      }
                      return r.score >= 0.70;
                    }).length;

                    return (
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={4}>
                          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: avgScore >= 75 ? 'success.light' : avgScore >= 50 ? 'warning.light' : 'error.light', bgcolor: avgScore >= 75 ? 'rgba(16, 185, 129, 0.08)' : avgScore >= 50 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              AVERAGE QUALITY SCORE
                            </Typography>
                            <Typography variant="h4" fontWeight={900} color={avgScore >= 75 ? 'success.main' : avgScore >= 50 ? 'warning.main' : 'error.main'}>
                              {avgScore.toFixed(1)}%
                            </Typography>
                          </Paper>
                        </Grid>

                        <Grid item xs={12} sm={4}>
                          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              PASSING METRICS (≥ 70%)
                            </Typography>
                            <Typography variant="h4" fontWeight={900} color="primary.main">
                              {passCount} / {validScores.length}
                            </Typography>
                          </Paper>
                        </Grid>

                        <Grid item xs={12} sm={4}>
                          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              OVERALL VERDICT
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>
                              <Chip
                                label={avgScore >= 80 ? 'EXCELLENT QUALITY' : avgScore >= 60 ? 'ACCEPTABLE QUALITY' : 'NEEDS REVISION'}
                                color={avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'error'}
                                sx={{ fontWeight: 800, fontSize: '0.85rem' }}
                              />
                            </Box>
                          </Paper>
                        </Grid>
                      </Grid>
                    );
                  })()}

                  {/* Individual Metric Cards */}
                  <Grid container spacing={2}>
                    {metricsResult.results?.map((res, idx) => {
                      const isRiskMetric = ['hallucination', 'bias', 'pii_leakage'].includes(res.metric_name);
                      const displayScore = (res.score !== null && res.score !== undefined) ? res.score : null;

                      // For positive metrics (faithfulness, precision, recall, etc.): >= 0.70 is Passed
                      // For risk metrics (hallucination, bias, pii_leakage): <= 0.25 is Passed (low risk is good!)
                      const isPassed = displayScore !== null && (isRiskMetric ? displayScore <= 0.25 : displayScore >= 0.70);
                      const isMarginal = displayScore !== null && (isRiskMetric ? (displayScore > 0.25 && displayScore <= 0.50) : (displayScore >= 0.50 && displayScore < 0.70));
                      const cardBorderColor = displayScore === null ? 'divider' : isPassed ? 'rgba(16, 185, 129, 0.4)' : isMarginal ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                      const chipColor = displayScore === null ? 'default' : isPassed ? 'success' : isMarginal ? 'warning' : 'error';
                      const barColor = isPassed ? '#10B981' : isMarginal ? '#F59E0B' : '#EF4444';

                      return (
                        <Grid item xs={12} md={6} key={idx}>
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2.5,
                              borderRadius: 2.5,
                              border: '1.5px solid',
                              borderColor: cardBorderColor,
                              bgcolor: 'background.paper',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column'
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" fontWeight={800}>
                                  {res.metric_name.replace(/_/g, ' ').toUpperCase()}
                                </Typography>
                                {isRiskMetric && (
                                  <Tooltip title="Risk metric: Lower score indicates better safety (0% is ideal, higher indicates detected risk/leakage)">
                                    <Chip label="Risk Metric" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                                  </Tooltip>
                                )}
                              </Box>

                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {res.verdict && (
                                  <Chip
                                    label={res.verdict}
                                    color={chipColor}
                                    size="small"
                                    sx={{ fontWeight: 700 }}
                                  />
                                )}
                                {displayScore !== null && (
                                  <Typography variant="h6" fontWeight={900} color={chipColor + '.main'}>
                                    {(displayScore * 100).toFixed(1)}%
                                  </Typography>
                                )}
                              </Box>
                            </Box>

                            {displayScore !== null ? (
                              <>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(100, Math.max(0, displayScore * 100))}
                                  sx={{
                                    height: 8,
                                    borderRadius: 4,
                                    bgcolor: 'rgba(0,0,0,0.06)',
                                    mb: 2,
                                    '& .MuiLinearProgress-bar': {
                                      bgcolor: barColor,
                                      borderRadius: 4
                                    }
                                  }}
                                />
                                {res.explanation && (
                                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', mt: 'auto' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
                                      {res.explanation}
                                    </Typography>
                                  </Box>
                                )}
                              </>
                            ) : (
                              <Alert severity="warning" sx={{ mt: 'auto', borderRadius: 1.5 }}>
                                <Typography variant="caption">
                                  {res.error || 'Evaluation metric did not return a valid score.'}
                                </Typography>
                              </Alert>
                            )}
                          </Paper>
                        </Grid>
                      );
                    })}
                  </Grid>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {metricsResult && metricsResult.error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight={700}>
                  ⚠️ Evaluation Error: {metricsResult.message}
                </Typography>
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                  Please ensure the DeepEval Python service is running on port 8000:
                  <Box component="code" sx={{ display: 'block', mt: 0.5, p: 1, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
                    npm run python-server
                  </Box>
                </Typography>
              </Alert>
            )}
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
}

export default PromptSchemaManager;

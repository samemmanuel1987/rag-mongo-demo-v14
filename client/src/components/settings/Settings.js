import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  TextField,
  Grid,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Divider,
  Stack,
  InputAdornment,
  Link
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  SmartToy as SmartToyIcon,
  SyncAlt as FallbackIcon,
  Hub as EmbeddingsIcon,
  VpnKey as KeyIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorIcon,
  Speed as SpeedIcon,
  OpenInNew as OpenInNewIcon,
  LowPriority as RerankIcon,
  Summarize as SummarizeIcon,
  Bolt as BoltIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

// Provider Model Definitions for UI
const LLM_PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq AI (Ultra Fast Inference)',
    badge: 'Fast & Free Tier',
    keyEnv: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys',
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
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini (Large Context & High Rate Limits)',
    badge: 'Recommended Fallback / Summarizer',
    keyEnv: 'GEMINI_API_KEY',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast & High TPM Limit)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (2M Context & Reasoning)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen Preview)' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o & GPT-4o Mini)',
    badge: 'High Accuracy',
    keyEnv: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Cost-Effective & Smart)' },
      { id: 'gpt-4o', name: 'GPT-4o (State of the Art Flagship)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ]
  },
  {
    id: 'claude',
    name: 'Anthropic Claude (Precise Technical QA)',
    badge: 'Top Reasoning',
    keyEnv: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast & Precise)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (State of the Art QA)' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral AI (European Open Intelligence)',
    badge: 'Multilingual & Embeddings',
    keyEnv: 'MISTRAL_API_KEY',
    keyUrl: 'https://console.mistral.ai/api-keys/',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small Latest' },
      { id: 'mistral-large-latest', name: 'Mistral Large Latest' },
      { id: 'codestral-latest', name: 'Codestral (Code & Test Cases)' }
    ]
  }
];

const EMBEDDING_PROVIDERS = [
  {
    id: 'mistral',
    name: 'Mistral AI (1024 Dimensions)',
    dimension: 1024,
    defaultModel: 'mistral-embed',
    keyEnv: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-embed', name: 'Mistral Embed (1024 dimensions)' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (1536 Dimensions)',
    dimension: 1536,
    defaultModel: 'text-embedding-3-small',
    keyEnv: 'OPENAI_API_KEY',
    models: [
      { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small (1536 dims)' },
      { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large (3072 dims)' },
      { id: 'text-embedding-ada-002', name: 'Ada 002 (1536 dims)' }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini (768 Dimensions)',
    dimension: 768,
    defaultModel: 'text-embedding-004',
    keyEnv: 'GEMINI_API_KEY',
    models: [
      { id: 'text-embedding-004', name: 'Text Embedding 004 (768 dims)' }
    ]
  }
];

function Settings() {
  const [tabIndex, setTabIndex] = useState(0);
  const [envVars, setEnvVars] = useState({
    LLM_PROVIDER: 'groq',
    LLM_MODEL: 'openai/gpt-oss-120b',
    RERANK_PROVIDER: 'groq',
    RERANK_MODEL: 'qwen/qwen3.6-27b',
    SUMMARIZATION_PROVIDER: 'groq',
    SUMMARIZATION_MODEL: 'openai/gpt-oss-120b',
    ENABLE_TOKEN_OPTIMIZATION: 'true',
    MAX_TOTAL_TOKENS: '8000',
    MAX_GENERATION_TOKENS: '3000',
    MAX_SUMMARY_TOKENS: '400',
    ENABLE_FALLBACK: 'true',
    FALLBACK_LLM_PROVIDER: 'mistral',
    FALLBACK_LLM_MODEL: 'mistral-small-latest',
    EMBEDDING_PROVIDER: 'mistral',
    EMBEDDING_MODEL: 'mistral-embed',
    GROQ_API_KEY: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    MISTRAL_API_KEY: '',
    MONGODB_URI: '',
    DB_NAME: 'db_stories_tests',
    COLLECTION_NAME: 'test_cases',
    VECTOR_INDEX_NAME: 'vector_index_test_cases',
    BM25_INDEX_NAME: 'bm25_search',
    USER_STORIES_COLLECTION_NAME: 'user_stories',
    USER_STORIES_VECTOR_INDEX_NAME: 'vector_index_user_story',
    USER_STORIES_BM25_INDEX_NAME: 'bm25_user_stories',
    PORT: '3001',
    DEEPEVAL_PORT: '8000',
    DEEPEVAL_URL: 'http://localhost:8000/eval',
    EVAL_MODEL: 'openai/gpt-oss-120b',
    ENABLED_METRICS: 'faithfulness,contextual_precision,contextual_recall,pii_leakage,bias,hallucination,ragas,answer_relevancy'
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [showSensitive, setShowSensitive] = useState({});
  const [showInfo, setShowInfo] = useState(false);

  // Connection Test States
  const [testingGeneration, setTestingGeneration] = useState(false);
  const [generationTestResult, setGenerationTestResult] = useState(null);

  const [testingRerank, setTestingRerank] = useState(false);
  const [rerankTestResult, setRerankTestResult] = useState(null);

  const [testingSummarize, setTestingSummarize] = useState(false);
  const [summarizeTestResult, setSummarizeTestResult] = useState(null);

  const [testingFallback, setTestingFallback] = useState(false);
  const [fallbackTestResult, setFallbackTestResult] = useState(null);

  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState(null);

  const [testingDeepeval, setTestingDeepeval] = useState(false);
  const [deepevalTestResult, setDeepevalTestResult] = useState(null);

  const [keyTestResults, setKeyTestResults] = useState({});
  const [testingKeyId, setTestingKeyId] = useState(null);

  const { enqueueSnackbar } = useSnackbar();

  const loadEnvVars = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/env`);
      setEnvVars(prev => ({
        ...prev,
        ...response.data
      }));
      enqueueSnackbar('Settings loaded successfully', { variant: 'success' });
    } catch (err) {
      const errorMessage = 'Failed to load environment variables';
      setError(errorMessage);
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadEnvVars();
  }, [loadEnvVars]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await axios.post(`${API_BASE}/env`, { envVars });
      setSuccess(true);
      enqueueSnackbar('Settings saved & applied in real-time!', { variant: 'success' });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to save settings';
      setError(errorMessage);
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setEnvVars(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const toggleSensitiveVisibility = (key) => {
    setShowSensitive(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getKeyForProvider = (providerId) => {
    const keyMap = {
      groq: envVars.GROQ_API_KEY,
      openai: envVars.OPENAI_API_KEY,
      claude: envVars.ANTHROPIC_API_KEY,
      gemini: envVars.GEMINI_API_KEY,
      mistral: envVars.MISTRAL_API_KEY
    };
    return keyMap[providerId];
  };

  // Test LLM Connection helper
  const testProviderConnection = async (provider, model) => {
    const apiKey = getKeyForProvider(provider);
    return await axios.post(`${API_BASE}/llm/test-connection`, {
      provider,
      apiKey,
      model
    });
  };

  // Test Generation LLM
  const handleTestGeneration = async () => {
    setTestingGeneration(true);
    setGenerationTestResult(null);
    try {
      const provider = envVars.LLM_PROVIDER || 'groq';
      const model = envVars.LLM_MODEL;
      const res = await testProviderConnection(provider, model);
      setGenerationTestResult(res.data);
      if (res.data.success) {
        enqueueSnackbar(`Generation LLM online (${res.data.latencyMs}ms)`, { variant: 'success' });
      } else {
        enqueueSnackbar(`Connection failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setGenerationTestResult({ success: false, error: errMsg });
      enqueueSnackbar(`Error: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingGeneration(false);
    }
  };

  // Test Rerank LLM
  const handleTestRerank = async () => {
    setTestingRerank(true);
    setRerankTestResult(null);
    try {
      const provider = envVars.RERANK_PROVIDER || 'groq';
      const model = envVars.RERANK_MODEL;
      const res = await testProviderConnection(provider, model);
      setRerankTestResult(res.data);
      if (res.data.success) {
        enqueueSnackbar(`Reranking LLM online (${res.data.latencyMs}ms)`, { variant: 'success' });
      } else {
        enqueueSnackbar(`Reranker failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setRerankTestResult({ success: false, error: errMsg });
      enqueueSnackbar(`Error: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingRerank(false);
    }
  };

  // Test Summarization LLM
  const handleTestSummarize = async () => {
    setTestingSummarize(true);
    setSummarizeTestResult(null);
    try {
      const provider = envVars.SUMMARIZATION_PROVIDER || 'groq';
      const model = envVars.SUMMARIZATION_MODEL;
      const res = await testProviderConnection(provider, model);
      setSummarizeTestResult(res.data);
      if (res.data.success) {
        enqueueSnackbar(`Summarization LLM online (${res.data.latencyMs}ms)`, { variant: 'success' });
      } else {
        enqueueSnackbar(`Summarizer failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setSummarizeTestResult({ success: false, error: errMsg });
      enqueueSnackbar(`Error: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingSummarize(false);
    }
  };

  // Test Fallback LLM Connection
  const handleTestFallbackLLM = async () => {
    setTestingFallback(true);
    setFallbackTestResult(null);
    try {
      const provider = envVars.FALLBACK_LLM_PROVIDER || 'mistral';
      const model = envVars.FALLBACK_LLM_MODEL;
      const res = await testProviderConnection(provider, model);
      setFallbackTestResult(res.data);
      if (res.data.success) {
        enqueueSnackbar(`Fallback LLM connected (${res.data.latencyMs}ms)`, { variant: 'success' });
      } else {
        enqueueSnackbar(`Fallback connection failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setFallbackTestResult({ success: false, error: errMsg });
      enqueueSnackbar(`Error testing fallback LLM: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingFallback(false);
    }
  };

  // Test Embedding Connection
  const handleTestEmbedding = async () => {
    setTestingEmbedding(true);
    setEmbeddingTestResult(null);
    try {
      const provider = envVars.EMBEDDING_PROVIDER || 'mistral';
      const apiKey = getKeyForProvider(provider);

      const res = await axios.post(`${API_BASE}/embedding/test-connection`, {
        provider,
        apiKey,
        model: envVars.EMBEDDING_MODEL
      });

      setEmbeddingTestResult(res.data);
      if (res.data.success) {
        enqueueSnackbar(`Embedding verified (${res.data.dimension} dims in ${res.data.latencyMs}ms)`, { variant: 'success' });
      } else {
        enqueueSnackbar(`Embedding test failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setEmbeddingTestResult({ success: false, error: errMsg });
      enqueueSnackbar(`Error testing embedding: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingEmbedding(false);
    }
  };

  // Test Individual API Key from Vault
  const handleTestKey = async (providerId, keyEnvName) => {
    setTestingKeyId(providerId);
    try {
      const apiKey = envVars[keyEnvName];
      const res = await axios.post(`${API_BASE}/llm/test-connection`, {
        provider: providerId,
        apiKey
      });

      setKeyTestResults(prev => ({
        ...prev,
        [providerId]: res.data
      }));

      if (res.data.success) {
        enqueueSnackbar(`${providerId.toUpperCase()} API key verified!`, { variant: 'success' });
      } else {
        enqueueSnackbar(`${providerId.toUpperCase()} check failed: ${res.data.error}`, { variant: 'error' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setKeyTestResults(prev => ({
        ...prev,
        [providerId]: { success: false, error: errMsg }
      }));
      enqueueSnackbar(`${providerId.toUpperCase()} validation error: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingKeyId(null);
    }
  };

  const getProviderObj = (providerId) => LLM_PROVIDERS.find(p => p.id === providerId) || LLM_PROVIDERS[0];
  const selectedGenProvider = getProviderObj(envVars.LLM_PROVIDER || 'groq');
  const selectedRerankProvider = getProviderObj(envVars.RERANK_PROVIDER || 'groq');
  const selectedSummarizeProvider = getProviderObj(envVars.SUMMARIZATION_PROVIDER || 'groq');
  const selectedFallbackProvider = getProviderObj(envVars.FALLBACK_LLM_PROVIDER || 'mistral');
  const selectedEmbeddingProvider = EMBEDDING_PROVIDERS.find(p => p.id === (envVars.EMBEDDING_PROVIDER || 'mistral')) || EMBEDDING_PROVIDERS[0];

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 1, md: 2 } }}>
      {/* Top Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
            }}
          >
            <SettingsIcon sx={{ fontSize: '1.4rem' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              System & Model Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure task-specific models (Generation, Reranking, Summarization), automatic failover, embeddings, and API keys.
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadEnvVars}
            disabled={loading || saving}
          >
            Reload
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={loading || saving}
            sx={{ px: 3, fontWeight: 600 }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Tooltip title="Documentation & Quick Guide">
            <IconButton onClick={() => setShowInfo(true)} size="medium">
              <InfoIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(false)}>
          Settings saved successfully! All LLM and Embedding configurations are active in real-time.
        </Alert>
      )}

      {/* Modern Navigation Tabs */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', mb: 3 }}>
        <Tabs
          value={tabIndex}
          onChange={(e, val) => setTabIndex(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 2,
            '& .MuiTab-root': {
              minHeight: 56,
              fontWeight: 600,
              fontSize: '0.9rem',
              textTransform: 'none',
              gap: 1
            }
          }}
        >
          <Tab icon={<SmartToyIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="Task LLM Models" />
          <Tab icon={<BoltIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="Token & Budget Control" />
          <Tab icon={<FallbackIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="Automatic Fallback" />
          <Tab icon={<EmbeddingsIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="Embeddings" />
          <Tab icon={<KeyIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="API Keys Vault" />
          <Tab icon={<StorageIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="Database & Indexes" />
          <Tab icon={<AssessmentIcon sx={{ fontSize: '1.2rem' }} />} iconPosition="start" label="DeepEval Service" />
        </Tabs>
      </Paper>

      {/* TAB 0: TASK-SPECIFIC LLM MODELS */}
      {tabIndex === 0 && (
        <Grid container spacing={3}>
          {/* Card 1: Test Case Generation & QA */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SmartToyIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={700}>Generation & QA</Typography>
                  </Box>
                }
                subheader="Primary model for test cases & prompt engineering"
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, flexGrow: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider</InputLabel>
                  <Select
                    value={envVars.LLM_PROVIDER || 'groq'}
                    label="Provider"
                    onChange={(e) => {
                      const newP = e.target.value;
                      const pObj = getProviderObj(newP);
                      setEnvVars(prev => ({
                        ...prev,
                        LLM_PROVIDER: newP,
                        LLM_MODEL: pObj?.defaultModel || ''
                      }));
                    }}
                  >
                    {LLM_PROVIDERS.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Model Preset</InputLabel>
                  <Select
                    value={selectedGenProvider.models.some(m => m.id === envVars.LLM_MODEL) ? envVars.LLM_MODEL : 'custom'}
                    label="Model Preset"
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        handleChange('LLM_MODEL', e.target.value);
                      }
                    }}
                  >
                    {selectedGenProvider.models.map(m => (
                      <MenuItem key={m.id} value={m.id}>{m.name} ({m.id})</MenuItem>
                    ))}
                    <MenuItem value="custom">Custom Model...</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Model ID"
                  value={envVars.LLM_MODEL || ''}
                  onChange={(e) => handleChange('LLM_MODEL', e.target.value)}
                />

                <Box sx={{ mt: 'auto', pt: 1, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    color="primary"
                    startIcon={testingGeneration ? <CircularProgress size={16} color="inherit" /> : <SpeedIcon />}
                    onClick={handleTestGeneration}
                    disabled={testingGeneration}
                  >
                    {testingGeneration ? 'Testing...' : 'Test Primary LLM'}
                  </Button>

                  {generationTestResult && (
                    <Chip
                      size="small"
                      icon={generationTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={generationTestResult.success ? `Online (${generationTestResult.latencyMs}ms)` : `Error: ${generationTestResult.error}`}
                      color={generationTestResult.success ? 'success' : 'error'}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Card 2: Semantic Reranking */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RerankIcon color="secondary" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={700}>Semantic Reranker</Typography>
                  </Box>
                }
                subheader="Fast cross-encoder LLM to rescore search results"
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, flexGrow: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider</InputLabel>
                  <Select
                    value={envVars.RERANK_PROVIDER || 'groq'}
                    label="Provider"
                    onChange={(e) => {
                      const newP = e.target.value;
                      const pObj = getProviderObj(newP);
                      setEnvVars(prev => ({
                        ...prev,
                        RERANK_PROVIDER: newP,
                        RERANK_MODEL: pObj?.defaultModel || ''
                      }));
                    }}
                  >
                    {LLM_PROVIDERS.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Model Preset</InputLabel>
                  <Select
                    value={selectedRerankProvider.models.some(m => m.id === envVars.RERANK_MODEL) ? envVars.RERANK_MODEL : 'custom'}
                    label="Model Preset"
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        handleChange('RERANK_MODEL', e.target.value);
                      }
                    }}
                  >
                    {selectedRerankProvider.models.map(m => (
                      <MenuItem key={m.id} value={m.id}>{m.name} ({m.id})</MenuItem>
                    ))}
                    <MenuItem value="custom">Custom Model...</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Rerank Model ID"
                  value={envVars.RERANK_MODEL || ''}
                  onChange={(e) => handleChange('RERANK_MODEL', e.target.value)}
                />

                <Box sx={{ mt: 'auto', pt: 1, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    color="secondary"
                    startIcon={testingRerank ? <CircularProgress size={16} color="inherit" /> : <SpeedIcon />}
                    onClick={handleTestRerank}
                    disabled={testingRerank}
                  >
                    {testingRerank ? 'Testing...' : 'Test Reranker'}
                  </Button>

                  {rerankTestResult && (
                    <Chip
                      size="small"
                      icon={rerankTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={rerankTestResult.success ? `Online (${rerankTestResult.latencyMs}ms)` : `Error: ${rerankTestResult.error}`}
                      color={rerankTestResult.success ? 'success' : 'error'}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Card 3: Summarization & Deduplication */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SummarizeIcon color="success" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={700}>Summarizer & Dedup</Typography>
                  </Box>
                }
                subheader="AI summary generation of retrieved test suites"
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, flexGrow: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider</InputLabel>
                  <Select
                    value={envVars.SUMMARIZATION_PROVIDER || 'groq'}
                    label="Provider"
                    onChange={(e) => {
                      const newP = e.target.value;
                      const pObj = getProviderObj(newP);
                      setEnvVars(prev => ({
                        ...prev,
                        SUMMARIZATION_PROVIDER: newP,
                        SUMMARIZATION_MODEL: pObj?.defaultModel || ''
                      }));
                    }}
                  >
                    {LLM_PROVIDERS.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Model Preset</InputLabel>
                  <Select
                    value={selectedSummarizeProvider.models.some(m => m.id === envVars.SUMMARIZATION_MODEL) ? envVars.SUMMARIZATION_MODEL : 'custom'}
                    label="Model Preset"
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        handleChange('SUMMARIZATION_MODEL', e.target.value);
                      }
                    }}
                  >
                    {selectedSummarizeProvider.models.map(m => (
                      <MenuItem key={m.id} value={m.id}>{m.name} ({m.id})</MenuItem>
                    ))}
                    <MenuItem value="custom">Custom Model...</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Summarization Model ID"
                  value={envVars.SUMMARIZATION_MODEL || ''}
                  onChange={(e) => handleChange('SUMMARIZATION_MODEL', e.target.value)}
                />

                <Box sx={{ mt: 'auto', pt: 1, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    color="success"
                    startIcon={testingSummarize ? <CircularProgress size={16} color="inherit" /> : <SpeedIcon />}
                    onClick={handleTestSummarize}
                    disabled={testingSummarize}
                  >
                    {testingSummarize ? 'Testing...' : 'Test Summarizer'}
                  </Button>

                  {summarizeTestResult && (
                    <Chip
                      size="small"
                      icon={summarizeTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={summarizeTestResult.success ? `Online (${summarizeTestResult.latencyMs}ms)` : `Error: ${summarizeTestResult.error}`}
                      color={summarizeTestResult.success ? 'success' : 'error'}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* TAB 1: TOKEN & 8K BUDGET CONTROL */}
      {tabIndex === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <BoltIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>Token Optimization & 8k Budget Control</Typography>
                  </Box>
                }
                subheader="Guarantees request payloads stay strictly under 8,000 tokens for free-tier Groq/Gemini models, eliminating '8000 token limit reached' errors."
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 3 }}>
                {/* On / Off Mode Toggle */}
                <Box sx={{
                  p: 2.5,
                  borderRadius: '12px',
                  bgcolor: (envVars.ENABLE_TOKEN_OPTIMIZATION === 'true' || envVars.ENABLE_TOKEN_OPTIMIZATION === true) ? 'rgba(16, 185, 129, 0.08)' : 'rgba(100, 116, 139, 0.08)',
                  border: '1px solid',
                  borderColor: (envVars.ENABLE_TOKEN_OPTIMIZATION === 'true' || envVars.ENABLE_TOKEN_OPTIMIZATION === true) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 116, 139, 0.2)'
                }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={envVars.ENABLE_TOKEN_OPTIMIZATION === 'true' || envVars.ENABLE_TOKEN_OPTIMIZATION === true}
                        onChange={(e) => handleChange('ENABLE_TOKEN_OPTIMIZATION', e.target.checked ? 'true' : 'false')}
                        color="success"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {(envVars.ENABLE_TOKEN_OPTIMIZATION === 'true' || envVars.ENABLE_TOKEN_OPTIMIZATION === true)
                            ? '⚡ Token Budget Optimization: ACTIVE (Learner / Groq 8k Free Mode)'
                            : '🏢 Token Budget Optimization: OFF (Enterprise / Unrestricted Mode)'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {(envVars.ENABLE_TOKEN_OPTIMIZATION === 'true' || envVars.ENABLE_TOKEN_OPTIMIZATION === true)
                            ? 'Actively compresses reference test case context, caps summary tokens, and dynamically bounds generation output to strictly prevent 8k context or TPM errors.'
                            : 'Sends full uncompressed prompt schema and raw context for large enterprise models (GPT-4o 128k, Claude Sonnet 200k, Gemini 2M context).'}
                        </Typography>
                      </Box>
                    }
                  />
                </Box>

                {/* Token Parameters */}
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Max Total Request Cap"
                      value={envVars.MAX_TOTAL_TOKENS || '8000'}
                      onChange={(e) => handleChange('MAX_TOTAL_TOKENS', e.target.value)}
                      helperText="Total token budget per request (Default: 8000 for Groq free tier)"
                      inputProps={{ min: 2000, max: 128000, step: 500 }}
                    />
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                      {['4000', '6000', '8000', '16000'].map((preset) => (
                        <Chip
                          key={preset}
                          label={`${preset}`}
                          size="small"
                          clickable
                          color={envVars.MAX_TOTAL_TOKENS === preset ? 'primary' : 'default'}
                          onClick={() => handleChange('MAX_TOTAL_TOKENS', preset)}
                        />
                      ))}
                    </Stack>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Max Generation Output"
                      value={envVars.MAX_GENERATION_TOKENS || '3000'}
                      onChange={(e) => handleChange('MAX_GENERATION_TOKENS', e.target.value)}
                      helperText="Max tokens allocated for generated test cases JSON (Default: 3000)"
                      inputProps={{ min: 1000, max: 16000, step: 500 }}
                    />
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                      {['2000', '3000', '4000'].map((preset) => (
                        <Chip
                          key={preset}
                          label={`${preset}`}
                          size="small"
                          clickable
                          color={envVars.MAX_GENERATION_TOKENS === preset ? 'primary' : 'default'}
                          onClick={() => handleChange('MAX_GENERATION_TOKENS', preset)}
                        />
                      ))}
                    </Stack>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Max Summary Context"
                      value={envVars.MAX_SUMMARY_TOKENS || '400'}
                      onChange={(e) => handleChange('MAX_SUMMARY_TOKENS', e.target.value)}
                      helperText="Max tokens allocated for RAG context summary (Default: 400)"
                      inputProps={{ min: 150, max: 2000, step: 50 }}
                    />
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                      {['250', '400', '600'].map((preset) => (
                        <Chip
                          key={preset}
                          label={`${preset}`}
                          size="small"
                          clickable
                          color={envVars.MAX_SUMMARY_TOKENS === preset ? 'primary' : 'default'}
                          onClick={() => handleChange('MAX_SUMMARY_TOKENS', preset)}
                        />
                      ))}
                    </Stack>
                  </Grid>
                </Grid>

                {/* Token Envelope Visualization */}
                <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'background.paper', border: '1px dashed', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    📊 8k Token Envelope Allocation (Learner Safe Profile)
                  </Typography>
                  <Grid container spacing={1} sx={{ mt: 0.5 }}>
                    <Grid item xs={6} sm={3}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: '8px' }}>
                        <Typography variant="caption" color="text.secondary">Input Prompt + Cases</Typography>
                        <Typography variant="body1" fontWeight={700} color="primary.main">~1,500 - 2,200</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: '8px' }}>
                        <Typography variant="caption" color="text.secondary">RAG Summary</Typography>
                        <Typography variant="body1" fontWeight={700} color="success.main">~300 - 400</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: '8px' }}>
                        <Typography variant="caption" color="text.secondary">Generated Test Cases</Typography>
                        <Typography variant="body1" fontWeight={700} color="secondary.main">~3,000</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: '8px' }}>
                        <Typography variant="caption" color="text.secondary">Safety Headroom</Typography>
                        <Typography variant="body1" fontWeight={700} color="warning.main">~2,400</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader title="Why 8k Token Budgeting?" />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  💡 <strong>Free Model Limits on Groq & Gemini:</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Groq free-tier models (such as <code>openai/gpt-oss-120b</code>, <code>qwen/qwen3.6-27b</code>, and <code>llama3-70b-8192</code>) have strict limits: <strong>8,192 context window</strong> and <strong>8,000 TPM limit</strong>.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • When a RAG prompt (user story + 5 test cases + summary + JSON schema) is combined with high output tokens, the request breaches 8,192 tokens and fails immediately.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Enabling <strong>Token Optimization</strong> automatically trims unnecessary whitespace, optimizes reference examples, and bounds completion tokens so test case generation always succeeds!
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* TAB 2: AUTOMATIC FALLBACK */}
      {tabIndex === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FallbackIcon color="warning" />
                    <Typography variant="h6" fontWeight={700}>Automatic Failover & Fallback Mechanism</Typography>
                  </Box>
                }
                subheader="Automatically switch to a backup LLM when rate limits (HTTP 429, 8k token caps) or server errors occur."
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 3 }}>
                <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={envVars.ENABLE_FALLBACK === 'true' || envVars.ENABLE_FALLBACK === true}
                        onChange={(e) => handleChange('ENABLE_FALLBACK', e.target.checked ? 'true' : 'false')}
                        color="warning"
                      />
                    }
                    label={
                      <Typography variant="subtitle1" fontWeight={700}>
                        Enable Automatic Fallback Failover
                      </Typography>
                    }
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    If enabled, requests that hit TPM/RPM limits (e.g. Groq 8,000 tokens/min limit), timeouts, or API errors will seamlessly retry using the designated fallback model below without user interruption.
                  </Typography>
                </Box>

                <FormControl fullWidth size="small">
                  <InputLabel>Fallback LLM Provider</InputLabel>
                  <Select
                    value={envVars.FALLBACK_LLM_PROVIDER || 'mistral'}
                    label="Fallback LLM Provider"
                    onChange={(e) => {
                      const newProviderId = e.target.value;
                      const providerObj = getProviderObj(newProviderId);
                      setEnvVars(prev => ({
                        ...prev,
                        FALLBACK_LLM_PROVIDER: newProviderId,
                        FALLBACK_LLM_MODEL: providerObj?.defaultModel || ''
                      }));
                    }}
                  >
                    {LLM_PROVIDERS.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                          <Chip label={p.badge} size="small" variant="outlined" sx={{ ml: 1, fontSize: '0.75rem' }} />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Fallback Model Preset</InputLabel>
                  <Select
                    value={
                      selectedFallbackProvider.models.some(m => m.id === envVars.FALLBACK_LLM_MODEL)
                        ? envVars.FALLBACK_LLM_MODEL
                        : 'custom'
                    }
                    label="Fallback Model Preset"
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        handleChange('FALLBACK_LLM_MODEL', e.target.value);
                      }
                    }}
                  >
                    {selectedFallbackProvider.models.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name} ({m.id})
                      </MenuItem>
                    ))}
                    <MenuItem value="custom">Custom Fallback Model...</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Fallback Model ID"
                  value={envVars.FALLBACK_LLM_MODEL || ''}
                  onChange={(e) => handleChange('FALLBACK_LLM_MODEL', e.target.value)}
                  helperText="Exact model name to use when failover triggers (e.g. mistral-small-latest, gemini-1.5-flash, gpt-4o-mini)"
                />

                <Box sx={{ pt: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={testingFallback ? <CircularProgress size={18} color="inherit" /> : <SpeedIcon />}
                    onClick={handleTestFallbackLLM}
                    disabled={testingFallback}
                  >
                    {testingFallback ? 'Testing Fallback...' : 'Test Fallback Connection'}
                  </Button>

                  {fallbackTestResult && (
                    <Chip
                      icon={fallbackTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={
                        fallbackTestResult.success
                          ? `Fallback Ready (${fallbackTestResult.latencyMs}ms)`
                          : `Error: ${fallbackTestResult.error}`
                      }
                      color={fallbackTestResult.success ? 'success' : 'error'}
                      variant="filled"
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader title="Fallback Strategy Tip" />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  💡 <strong>Recommended pairing:</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • <strong>Primary:</strong> Groq (Qwen 3.6 27B / Llama 3.3 70B) for ultra-fast response times.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • <strong>Fallback:</strong> Google Gemini (Gemini 1.5 Flash) or Mistral AI (Mistral Small) which provide high rate limits without sudden throttling.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* TAB 3: EMBEDDINGS */}
      {tabIndex === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <EmbeddingsIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>Embedding Provider & Model</Typography>
                  </Box>
                }
                subheader="Select the vector embedding model used for vector search, user stories, and test cases."
              />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 3 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Embedding Provider</InputLabel>
                  <Select
                    value={envVars.EMBEDDING_PROVIDER || 'mistral'}
                    label="Embedding Provider"
                    onChange={(e) => {
                      const newProviderId = e.target.value;
                      const providerObj = EMBEDDING_PROVIDERS.find(p => p.id === newProviderId);
                      setEnvVars(prev => ({
                        ...prev,
                        EMBEDDING_PROVIDER: newProviderId,
                        EMBEDDING_MODEL: providerObj?.defaultModel || ''
                      }));
                    }}
                  >
                    {EMBEDDING_PROVIDERS.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Model Preset</InputLabel>
                  <Select
                    value={
                      selectedEmbeddingProvider.models.some(m => m.id === envVars.EMBEDDING_MODEL)
                        ? envVars.EMBEDDING_MODEL
                        : 'custom'
                    }
                    label="Model Preset"
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        handleChange('EMBEDDING_MODEL', e.target.value);
                      }
                    }}
                  >
                    {selectedEmbeddingProvider.models.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name}
                      </MenuItem>
                    ))}
                    <MenuItem value="custom">Custom Model...</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Embedding Model ID"
                  value={envVars.EMBEDDING_MODEL || ''}
                  onChange={(e) => handleChange('EMBEDDING_MODEL', e.target.value)}
                />

                <Alert severity="info" sx={{ borderRadius: '10px' }}>
                  <strong>MongoDB Atlas Vector Search Index Requirement:</strong> The dimension of your index must match your embedding model dimension (e.g. Mistral Embed = <strong>1024</strong> dims, OpenAI text-embedding-3-small = <strong>1536</strong> dims, Gemini text-embedding-004 = <strong>768</strong> dims).
                </Alert>

                <Box sx={{ pt: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={testingEmbedding ? <CircularProgress size={18} color="inherit" /> : <SpeedIcon />}
                    onClick={handleTestEmbedding}
                    disabled={testingEmbedding}
                  >
                    {testingEmbedding ? 'Generating Embedding...' : 'Test Embedding Connection'}
                  </Button>

                  {embeddingTestResult && (
                    <Chip
                      icon={embeddingTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={
                        embeddingTestResult.success
                          ? `Dimension: ${embeddingTestResult.dimension} | Latency: ${embeddingTestResult.latencyMs}ms`
                          : `Error: ${embeddingTestResult.error}`
                      }
                      color={embeddingTestResult.success ? 'success' : 'error'}
                      variant="filled"
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 1 }}>
              <CardHeader title="Dimensions Reference" />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2">Mistral AI</Typography>
                  <Typography variant="body2" color="text.secondary"><code>mistral-embed</code> → 1024 dims</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2">OpenAI</Typography>
                  <Typography variant="body2" color="text.secondary"><code>text-embedding-3-small</code> → 1536 dims</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2">Google Gemini</Typography>
                  <Typography variant="body2" color="text.secondary"><code>text-embedding-004</code> → 768 dims</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* TAB 4: API KEYS VAULT */}
      {tabIndex === 4 && (
        <Grid container spacing={3}>
          {[
            {
              id: 'groq',
              label: 'Groq API Key',
              envKey: 'GROQ_API_KEY',
              desc: 'For ultra-fast inference with Qwen 3.6, Llama 3.3, and GPT-OSS models',
              url: 'https://console.groq.com/keys'
            },
            {
              id: 'gemini',
              label: 'Google Gemini API Key',
              envKey: 'GEMINI_API_KEY',
              desc: 'For Gemini 1.5 Flash/Pro, Gemini 2.0, & text-embedding-004',
              url: 'https://aistudio.google.com/app/apikey'
            },
            {
              id: 'openai',
              label: 'OpenAI API Key',
              envKey: 'OPENAI_API_KEY',
              desc: 'For GPT-4o, GPT-4o Mini, & Text Embedding 3',
              url: 'https://platform.openai.com/api-keys'
            },
            {
              id: 'claude',
              label: 'Anthropic Claude API Key',
              envKey: 'ANTHROPIC_API_KEY',
              desc: 'For Claude 3.5 Sonnet & Claude 3.5 Haiku',
              url: 'https://console.anthropic.com/settings/keys'
            },
            {
              id: 'mistral',
              label: 'Mistral AI API Key',
              envKey: 'MISTRAL_API_KEY',
              desc: 'For Mistral Embed & Mistral Large/Small models',
              url: 'https://console.mistral.ai/api-keys/'
            }
          ].map((item) => {
            const isVisible = showSensitive[item.envKey];
            const val = envVars[item.envKey] || '';
            const testResult = keyTestResults[item.id];
            const isTesting = testingKeyId === item.id;

            return (
              <Grid item xs={12} md={6} key={item.id}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%' }}>
                  <CardHeader
                    title={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1" fontWeight={700}>{item.label}</Typography>
                        <Link href={item.url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem' }}>
                          Get Key <OpenInNewIcon sx={{ fontSize: '0.85rem' }} />
                        </Link>
                      </Box>
                    }
                    subheader={item.desc}
                  />
                  <CardContent sx={{ pt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type={isVisible ? 'text' : 'password'}
                      value={val}
                      onChange={(e) => handleChange(item.envKey, e.target.value)}
                      placeholder={`Enter ${item.label}`}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => toggleSensitiveVisibility(item.envKey)} edge="end">
                              {isVisible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleTestKey(item.id, item.envKey)}
                        disabled={!val || isTesting}
                        startIcon={isTesting ? <CircularProgress size={14} /> : <SecurityIcon fontSize="small" />}
                      >
                        {isTesting ? 'Verifying...' : 'Validate Key'}
                      </Button>

                      {testResult && (
                        <Chip
                          size="small"
                          icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={testResult.success ? 'Valid Key' : 'Invalid Key'}
                          color={testResult.success ? 'success' : 'error'}
                        />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* TAB 5: DATABASE & INDEXES */}
      {tabIndex === 5 && (
        <Grid container spacing={3}>
          {[
            {
              key: 'MONGODB_URI',
              label: 'MongoDB Connection URI',
              desc: 'MongoDB Atlas SRV connection string with credentials',
              sensitive: true
            },
            {
              key: 'DB_NAME',
              label: 'Database Name',
              desc: 'Target MongoDB database name (e.g. db_stories_tests)',
              sensitive: false
            },
            {
              key: 'COLLECTION_NAME',
              label: 'Test Cases Collection',
              desc: 'Collection name storing test case documents',
              sensitive: false
            },
            {
              key: 'VECTOR_INDEX_NAME',
              label: 'Test Cases Vector Search Index',
              desc: 'Atlas Vector Search index name on test cases collection',
              sensitive: false
            },
            {
              key: 'BM25_INDEX_NAME',
              label: 'Test Cases BM25 Search Index',
              desc: 'Atlas Search text index for keyword BM25 retrieval',
              sensitive: false
            },
            {
              key: 'USER_STORIES_COLLECTION_NAME',
              label: 'User Stories Collection',
              desc: 'Collection name storing user stories',
              sensitive: false
            },
            {
              key: 'USER_STORIES_VECTOR_INDEX_NAME',
              label: 'User Stories Vector Search Index',
              desc: 'Atlas Vector Search index name on user stories collection',
              sensitive: false
            },
            {
              key: 'USER_STORIES_BM25_INDEX_NAME',
              label: 'User Stories BM25 Search Index',
              desc: 'Atlas Search text index for user story keyword retrieval',
              sensitive: false
            }
          ].map((field) => {
            const isVisible = !field.sensitive || showSensitive[field.key];
            const val = envVars[field.key] || '';

            return (
              <Grid item xs={12} md={6} key={field.key}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%' }}>
                  <CardHeader
                    title={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700}>{field.label}</Typography>
                        {field.sensitive && <Chip label="Protected" size="small" color="warning" variant="outlined" />}
                      </Box>
                    }
                    subheader={field.desc}
                  />
                  <CardContent sx={{ pt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type={isVisible ? 'text' : 'password'}
                      value={val}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      InputProps={{
                        endAdornment: field.sensitive && (
                          <InputAdornment position="end">
                            <IconButton onClick={() => toggleSensitiveVisibility(field.key)} edge="end">
                              {isVisible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* TAB 6: DEEPEVAL EVALUATION SERVICE */}
      {tabIndex === 6 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AssessmentIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>DeepEval Service Settings</Typography>
                  </Box>
                }
                subheader="Configure connection to FastAPI DeepEval sidecar service on port 8000"
              />
              <CardContent>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      DEEPEVAL ENDPOINT URL (DEEPEVAL_URL)
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={envVars.DEEPEVAL_URL || 'http://localhost:8000/eval'}
                      onChange={(e) => handleChange('DEEPEVAL_URL', e.target.value)}
                      placeholder="http://localhost:8000/eval"
                      helperText="Target endpoint for evaluating LLM test cases"
                      sx={{ mt: 0.5 }}
                    />
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        EXPRESS PORT (PORT)
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        value={envVars.PORT || '3001'}
                        onChange={(e) => handleChange('PORT', e.target.value)}
                        placeholder="3001"
                        sx={{ mt: 0.5 }}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        DEEPEVAL PORT (DEEPEVAL_PORT)
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        value={envVars.DEEPEVAL_PORT || '8000'}
                        onChange={(e) => handleChange('DEEPEVAL_PORT', e.target.value)}
                        placeholder="8000"
                        sx={{ mt: 0.5 }}
                      />
                    </Grid>
                  </Grid>

                  <Box>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      EVALUATION LLM MODEL (EVAL_MODEL)
                    </Typography>
                    <FormControl fullWidth size="small" sx={{ mt: 0.5 }}>
                      <Select
                        value={envVars.EVAL_MODEL || 'openai/gpt-oss-120b'}
                        onChange={(e) => handleChange('EVAL_MODEL', e.target.value)}
                      >
                        <MenuItem value="openai/gpt-oss-120b">openai/gpt-oss-120b (Groq - High Capability & Default)</MenuItem>
                        <MenuItem value="openai/gpt-oss-20b">openai/gpt-oss-20b (Groq - Fast & Lightweight)</MenuItem>
                        <MenuItem value="qwen/qwen3.8-27b">qwen/qwen3.8-27b (Groq - Accurate)</MenuItem>
                        <MenuItem value="allam-2-7b">allam-2-7b (Groq)</MenuItem>
                        <MenuItem value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Groq)</MenuItem>
                        <MenuItem value="gpt-4o-mini">gpt-4o-mini (OpenAI)</MenuItem>
                        <MenuItem value="gpt-4o">gpt-4o (OpenAI)</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Box sx={{ pt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={testingDeepeval ? <CircularProgress size={18} /> : <SpeedIcon />}
                      disabled={testingDeepeval}
                      onClick={async () => {
                        setTestingDeepeval(true);
                        setDeepevalTestResult(null);
                        try {
                          const res = await axios.get(`${API_BASE}/eval/health`);
                          setDeepevalTestResult({ success: true, message: `Connected! ${res.data.service || 'DeepEval Service'}` });
                          enqueueSnackbar('DeepEval service is online and healthy!', { variant: 'success' });
                        } catch (err) {
                          setDeepevalTestResult({ success: false, message: 'DeepEval service unreachable on port 8000' });
                          enqueueSnackbar('DeepEval is offline. Run: npm run python-server', { variant: 'error' });
                        } finally {
                          setTestingDeepeval(false);
                        }
                      }}
                    >
                      {testingDeepeval ? 'Checking Service...' : 'Test DeepEval Health'}
                    </Button>

                    {deepevalTestResult && (
                      <Chip
                        icon={deepevalTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                        label={deepevalTestResult.message}
                        color={deepevalTestResult.success ? 'success' : 'error'}
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', height: '100%' }}>
              <CardHeader
                title={<Typography variant="subtitle1" fontWeight={700}>Default Metrics (ENABLED_METRICS)</Typography>}
                subheader="Comma-separated list of active quality metrics"
              />
              <CardContent>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                  value={envVars.ENABLED_METRICS || 'faithfulness,contextual_precision,contextual_recall,pii_leakage,bias,hallucination,ragas,answer_relevancy'}
                  onChange={(e) => handleChange('ENABLED_METRICS', e.target.value)}
                  helperText="Metrics enabled by default for all test case evaluations"
                />

                <Box sx={{ mt: 2.5, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" gutterBottom>
                    SUPPORTED DEEPEVAL METRICS:
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
                    • <strong>faithfulness</strong>: Evaluates context grounding<br />
                    • <strong>contextual_precision</strong>: Precision of retrieval ranking<br />
                    • <strong>contextual_recall</strong>: Context coverage for test cases<br />
                    • <strong>answer_relevancy</strong>: Query-to-test alignment<br />
                    • <strong>hallucination</strong>: Ungrounded statement detection<br />
                    • <strong>bias</strong>: Demographic & sentiment bias<br />
                    • <strong>pii_leakage</strong>: Privacy protection validation<br />
                    • <strong>ragas</strong>: Comprehensive RAG metric
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Info Dialog */}
      <Dialog open={showInfo} onClose={() => setShowInfo(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>RAG Pipeline Multi-LLM Configuration Guide</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Supported Providers & Capabilities
          </Typography>
          <Typography variant="body2" paragraph>
            • <strong>Groq:</strong> Ultra-fast execution using open-source models like Qwen 3.6 27B and Llama 3.3 70B.
            <br />
            • <strong>Google Gemini:</strong> Gemini 1.5 Flash/Pro with high rate limits and 1M-2M context window.
            <br />
            • <strong>OpenAI:</strong> GPT-4o & GPT-4o Mini with top reasoning accuracy.
            <br />
            • <strong>Anthropic Claude:</strong> Claude 3.5 Sonnet & Haiku for nuanced test scenarios.
            <br />
            • <strong>Mistral AI:</strong> Mistral Large & Mistral Embed models.
          </Typography>

          <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ mt: 2 }}>
            Task-Specific Model Strategy
          </Typography>
          <Typography variant="body2" paragraph>
            You can configure different LLMs for different tasks to optimize cost and performance:
            <br />
            - Use a fast, cost-free model (e.g. Groq Qwen 3.6 or Llama 3.2 3B) for <strong>Semantic Reranking</strong>.
            <br />
            - Use a high rate-limit model (e.g. Google Gemini 1.5 Flash) for <strong>Summarization</strong>.
            <br />
            - Use a high-reasoning model (e.g. Claude 3.5 Sonnet or OpenAI GPT-4o) for <strong>Test Case Generation</strong>.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInfo(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings;
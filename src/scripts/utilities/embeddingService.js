/**
 * Unified Multi-Provider Embedding Service
 * 
 * Supports:
 * - Mistral AI (mistral-embed - 1024 dimensions)
 * - OpenAI (text-embedding-3-small - 1536 dims, text-embedding-3-large - 3072 dims, text-embedding-ada-002 - 1536 dims)
 * - Google Gemini (text-embedding-004 - 768 dimensions)
 * 
 * Features:
 * - Single text and batch embedding generation
 * - Chunked processing with rate limiting
 * - Connection testing
 * - Configurable via environment variables or runtime overrides
 */

import axios from 'axios';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export const EMBEDDING_PRESETS = {
  mistral: {
    name: 'Mistral AI',
    defaultModel: 'mistral-embed',
    dimension: 1024,
    models: [
      { id: 'mistral-embed', name: 'Mistral Embed (1024 dims)', dimension: 1024 }
    ],
    keyEnv: 'MISTRAL_API_KEY'
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'text-embedding-3-small',
    dimension: 1536,
    models: [
      { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small (1536 dims)', dimension: 1536 },
      { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large (3072 dims)', dimension: 3072 },
      { id: 'text-embedding-ada-002', name: 'Ada 002 (1536 dims)', dimension: 1536 }
    ],
    keyEnv: 'OPENAI_API_KEY'
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'text-embedding-004',
    dimension: 768,
    models: [
      { id: 'text-embedding-004', name: 'Text Embedding 004 (768 dims)', dimension: 768 }
    ],
    keyEnv: 'GEMINI_API_KEY'
  }
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export function getEmbeddingConfig() {
  const provider = (process.env.EMBEDDING_PROVIDER || 'mistral').toLowerCase().trim();
  const model = process.env.EMBEDDING_MODEL || process.env.MISTRAL_EMBEDDING_MODEL || EMBEDDING_PRESETS[provider]?.defaultModel || 'mistral-embed';
  const baseUrl = process.env.EMBEDDING_BASE_URL || null;

  return {
    provider,
    model,
    baseUrl,
    mistralApiKey: process.env.MISTRAL_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  };
}

export function getEmbeddingApiKey(provider, config = null) {
  const cfg = config || getEmbeddingConfig();
  switch ((provider || '').toLowerCase()) {
    case 'mistral':
      return cfg.mistralApiKey || process.env.MISTRAL_API_KEY;
    case 'openai':
      return cfg.openaiApiKey || process.env.OPENAI_API_KEY;
    case 'gemini':
    case 'google':
      return cfg.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    default:
      return null;
  }
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text, options = {}, retryCount = 0) {
  const config = getEmbeddingConfig();
  const provider = (options.provider || config.provider || 'mistral').toLowerCase();
  const model = options.model || (options.provider ? EMBEDDING_PRESETS[provider]?.defaultModel : config.model) || 'mistral-embed';
  const apiKey = options.apiKey || getEmbeddingApiKey(provider, config);

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error(`API key for embedding provider '${provider}' is not configured. Please set ${EMBEDDING_PRESETS[provider]?.keyEnv || provider.toUpperCase() + '_API_KEY'} in Settings.`);
  }

  try {
    console.log(`🧠 [VECTOR EMBEDDING] Provider: [${provider.toUpperCase()}] | Model: [${model}]`);
    switch (provider) {
      case 'mistral': {
        const mistralUrl = options.baseUrl || config.baseUrl || 'https://api.mistral.ai/v1';
        const response = await axios.post(
          `${mistralUrl}/embeddings`,
          {
            model: model,
            input: [text]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            timeout: 30000
          }
        );

        if (!response.data || !response.data.data || !response.data.data[0]) {
          throw new Error('Invalid response from Mistral Embeddings API');
        }

        return {
          embedding: response.data.data[0].embedding,
          model: response.data.model || model,
          provider: 'mistral',
          usage: response.data.usage,
          metadata: {
            model: response.data.model || model,
            tokens: response.data.usage?.total_tokens || 0,
            apiSource: 'mistral',
            dimension: response.data.data[0].embedding.length,
            createdAt: new Date()
          }
        };
      }

      case 'openai': {
        const openai = new OpenAI({
          apiKey,
          baseURL: options.baseUrl || config.baseUrl || undefined
        });

        const response = await openai.embeddings.create({
          model: model,
          input: text
        });

        if (!response.data || !response.data[0]) {
          throw new Error('Invalid response from OpenAI Embeddings API');
        }

        return {
          embedding: response.data[0].embedding,
          model: response.model || model,
          provider: 'openai',
          usage: response.usage,
          metadata: {
            model: response.model || model,
            tokens: response.usage?.total_tokens || 0,
            apiSource: 'openai',
            dimension: response.data[0].embedding.length,
            createdAt: new Date()
          }
        };
      }

      case 'gemini':
      case 'google': {
        const genAI = new GoogleGenerativeAI(apiKey);
        const embedModel = genAI.getGenerativeModel({ model: model || 'text-embedding-004' });
        const result = await embedModel.embedContent(text);
        const embeddingValues = result.embedding?.values;

        if (!embeddingValues) {
          throw new Error('Invalid response from Gemini Embeddings API');
        }

        return {
          embedding: embeddingValues,
          model: model,
          provider: 'gemini',
          usage: { total_tokens: Math.ceil(text.length / 4) },
          metadata: {
            model: model,
            tokens: Math.ceil(text.length / 4),
            apiSource: 'gemini',
            dimension: embeddingValues.length,
            createdAt: new Date()
          }
        };
      }

      default:
        throw new Error(`Unsupported embedding provider: '${provider}'. Supported: mistral, openai, gemini`);
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const waitTime = RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`⚠️ Retrying embedding in ${waitTime}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return generateEmbedding(text, options, retryCount + 1);
    }

    if (error.response) {
      throw new Error(`${provider.toUpperCase()} Embeddings error: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`);
    }
    throw new Error(`Failed to generate embedding with ${provider}: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple texts (batch processing)
 */
export async function generateBatchEmbeddings(texts, options = {}, retryCount = 0) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('texts must be a non-empty array');
  }

  const config = getEmbeddingConfig();
  const provider = (options.provider || config.provider || 'mistral').toLowerCase();
  const model = options.model || (options.provider ? EMBEDDING_PRESETS[provider]?.defaultModel : config.model) || 'mistral-embed';
  const apiKey = options.apiKey || getEmbeddingApiKey(provider, config);

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error(`API key for embedding provider '${provider}' is not configured. Please set ${EMBEDDING_PRESETS[provider]?.keyEnv || provider.toUpperCase() + '_API_KEY'} in Settings.`);
  }

  try {
    switch (provider) {
      case 'mistral': {
        const mistralUrl = options.baseUrl || config.baseUrl || 'https://api.mistral.ai/v1';
        const response = await axios.post(
          `${mistralUrl}/embeddings`,
          {
            model: model,
            input: texts
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            timeout: 60000
          }
        );

        if (!response.data || !response.data.data) {
          throw new Error('Invalid response from Mistral Embeddings API');
        }

        const embeddings = response.data.data.map(item => item.embedding);
        const usage = response.data.usage;

        return {
          embeddings,
          model: response.data.model || model,
          provider: 'mistral',
          usage,
          batchSize: texts.length,
          metadata: {
            model: response.data.model || model,
            totalTokens: usage?.total_tokens || 0,
            tokensPerInput: usage?.total_tokens ? Math.round(usage.total_tokens / texts.length) : 0,
            apiSource: 'mistral-batch',
            batchSize: texts.length,
            createdAt: new Date()
          }
        };
      }

      case 'openai': {
        const openai = new OpenAI({
          apiKey,
          baseURL: options.baseUrl || config.baseUrl || undefined
        });

        const response = await openai.embeddings.create({
          model: model,
          input: texts
        });

        if (!response.data) {
          throw new Error('Invalid response from OpenAI Embeddings API');
        }

        const embeddings = response.data.map(item => item.embedding);

        return {
          embeddings,
          model: response.model || model,
          provider: 'openai',
          usage: response.usage,
          batchSize: texts.length,
          metadata: {
            model: response.model || model,
            totalTokens: response.usage?.total_tokens || 0,
            tokensPerInput: response.usage?.total_tokens ? Math.round(response.usage.total_tokens / texts.length) : 0,
            apiSource: 'openai-batch',
            batchSize: texts.length,
            createdAt: new Date()
          }
        };
      }

      case 'gemini':
      case 'google': {
        // Gemini batch embedding via individual or mapped calls
        const genAI = new GoogleGenerativeAI(apiKey);
        const embedModel = genAI.getGenerativeModel({ model: model || 'text-embedding-004' });

        const results = await Promise.all(
          texts.map(t => embedModel.embedContent(t))
        );

        const embeddings = results.map(r => r.embedding?.values);
        const totalEstimatedTokens = texts.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0);

        return {
          embeddings,
          model: model,
          provider: 'gemini',
          usage: { total_tokens: totalEstimatedTokens },
          batchSize: texts.length,
          metadata: {
            model: model,
            totalTokens: totalEstimatedTokens,
            tokensPerInput: Math.round(totalEstimatedTokens / texts.length),
            apiSource: 'gemini-batch',
            batchSize: texts.length,
            createdAt: new Date()
          }
        };
      }

      default:
        throw new Error(`Unsupported embedding provider: '${provider}'`);
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const waitTime = RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`⚠️ Batch retry in ${waitTime}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return generateBatchEmbeddings(texts, options, retryCount + 1);
    }

    if (error.response) {
      throw new Error(`${provider.toUpperCase()} Batch Embeddings error: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`);
    }
    throw new Error(`Failed to generate batch embeddings with ${provider}: ${error.message}`);
  }
}

/**
 * Process large datasets with chunking
 */
export async function generateEmbeddingsChunked(texts, chunkSize = 100, onProgress = null, options = {}) {
  const results = [];
  const totalChunks = Math.ceil(texts.length / chunkSize);

  console.log(`📦 Processing ${texts.length} texts in ${totalChunks} chunks of ${chunkSize}`);

  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;

    try {
      console.log(`🔄 Processing chunk ${chunkNumber}/${totalChunks}...`);
      const result = await generateBatchEmbeddings(chunk, options);

      const chunkResults = result.embeddings.map((embedding, index) => ({
        text: chunk[index],
        embedding: embedding,
        metadata: {
          ...result.metadata,
          chunkNumber: chunkNumber,
          indexInChunk: index,
          globalIndex: i + index
        }
      }));

      results.push(...chunkResults);

      if (onProgress) {
        onProgress({
          processed: results.length,
          total: texts.length,
          chunkNumber: chunkNumber,
          totalChunks: totalChunks,
          percentage: (results.length / texts.length * 100).toFixed(1)
        });
      }

      if (i + chunkSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`❌ Failed to process chunk ${chunkNumber}:`, error.message);
      for (let j = 0; j < chunk.length; j++) {
        results.push({
          text: chunk[j],
          embedding: null,
          error: error.message,
          metadata: {
            chunkNumber: chunkNumber,
            indexInChunk: j,
            globalIndex: i + j,
            failed: true
          }
        });
      }
    }
  }

  return results;
}

/**
 * Test Connection for a given embedding provider
 */
export async function testEmbeddingConnection({
  provider,
  apiKey,
  model = null,
  baseUrl = null
}) {
  const p = (provider || 'mistral').toLowerCase().trim();
  const testModel = model || EMBEDDING_PRESETS[p]?.defaultModel || 'mistral-embed';

  try {
    const startTime = Date.now();
    const result = await generateEmbedding('Antigravity connection test text', {
      provider: p,
      model: testModel,
      apiKey,
      baseUrl
    });
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      provider: p,
      model: result.model,
      dimension: result.embedding.length,
      latencyMs: elapsed,
      message: `Connection successful! Generated ${result.embedding.length}-dim embedding in ${elapsed}ms.`
    };
  } catch (error) {
    return {
      success: false,
      provider: p,
      model: testModel,
      error: error.message || 'Connection failed',
      message: `Failed to connect to ${EMBEDDING_PRESETS[p]?.name || p} embeddings: ${error.message}`
    };
  }
}

/**
 * Get dimension for configured model
 */
export function getEmbeddingDimension(provider = null, model = null) {
  const p = (provider || process.env.EMBEDDING_PROVIDER || 'mistral').toLowerCase();
  return EMBEDDING_PRESETS[p]?.dimension || 1024;
}

export default {
  EMBEDDING_PRESETS,
  getEmbeddingConfig,
  getEmbeddingApiKey,
  generateEmbedding,
  generateBatchEmbeddings,
  generateEmbeddingsChunked,
  testEmbeddingConnection,
  getEmbeddingDimension
};

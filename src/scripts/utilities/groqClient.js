/**
 * Groq & Unified Multi-LLM Client
 * 
 * Re-exports unified multi-LLM service methods with fallback capabilities
 * for seamless backwards compatibility.
 */

import {
  testLLMConnection,
  rerankDocuments,
  summarizeResults,
  generateAnswer,
  chatCompletion,
  getLLMConfig
} from './llmService.js';

export {
  rerankDocuments,
  summarizeResults,
  generateAnswer,
  chatCompletion
};

export async function testConnection() {
  const config = getLLMConfig();
  const res = await testLLMConnection({ provider: config.provider, apiKey: null });
  return res.success;
}

export async function batchRerank(queries, documents, topK = 10) {
  return Promise.all(queries.map(q => rerankDocuments(q, documents, topK)));
}

export function getModelInfo() {
  const config = getLLMConfig();
  return {
    provider: config.provider,
    model: config.model,
    enableFallback: config.enableFallback,
    fallbackProvider: config.fallbackProvider,
    fallbackModel: config.fallbackModel,
    capabilities: ['rerank', 'summarize', 'qa', 'chat', 'fallback']
  };
}

export default {
  testConnection,
  rerankDocuments,
  summarizeResults,
  generateAnswer,
  batchRerank,
  getModelInfo,
  chatCompletion
};

/**
 * Embedding Service Wrapper (Formerly Mistral AI Embedding Utility)
 * 
 * Re-exports unified multi-provider embedding methods (Mistral, OpenAI, Gemini)
 * for backwards compatibility.
 */

import {
  generateEmbedding,
  generateBatchEmbeddings,
  generateEmbeddingsChunked,
  getEmbeddingDimension,
  testEmbeddingConnection,
  getEmbeddingConfig
} from './embeddingService.js';

export {
  generateEmbedding,
  generateBatchEmbeddings,
  generateEmbeddingsChunked,
  getEmbeddingDimension
};

export async function testConnection() {
  const config = getEmbeddingConfig();
  const res = await testEmbeddingConnection({ provider: config.provider, apiKey: null });
  return res.success;
}

export default {
  generateEmbedding,
  generateBatchEmbeddings,
  generateEmbeddingsChunked,
  getEmbeddingDimension,
  testConnection
};

#!/usr/bin/env node

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import axios from 'axios';
import { generateEmbedding } from '../utilities/embeddingService.js';

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI, {
  ssl: true,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true
});

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;

/**
 * Generate embedding for search query
 */
async function generateQueryEmbedding(query) {
  try {
    const result = await generateEmbedding(query);
    return {
      embedding: result.embedding,
      cost: (result.usage?.total_tokens || 0) / 1000000 * 0.10,
      tokens: result.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('Error generating query embedding:', error.message);
    throw error;
  }
}

/**
 * Perform vector search
 */
async function vectorSearch(collection, queryVector, limit = 50, filters = {}) {
  const pipeline = [
    {
      $vectorSearch: {
        queryVector,
        path: "embedding",
        numCandidates: Math.max(limit * 2, 100),
        limit: limit,
        index: process.env.VECTOR_INDEX_NAME,
        ...(Object.keys(filters).length > 0 && { filter: filters })
      }
    },
    {
      $addFields: {
        vectorScore: { $meta: "vectorSearchScore" }
      }
    },
    { $project: { embedding: 0 } }
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Perform BM25 search
 */
async function bm25Search(collection, query, limit = 50, filters = {}) {
  const weights = {
    id: 10.0,
    title: 8.0,
    module: 5.0,
    description: 2.0,
    expectedResults: 1.5,
    steps: 1.0,
    preRequisites: 0.8
  };

  const searchFields = Object.entries(weights).map(([field, weight]) => ({
    text: {
      query: query,
      path: field,
      score: { boost: { value: weight } }
    }
  }));

  const pipeline = [
    {
      $search: {
        index: process.env.BM25_INDEX_NAME,
        compound: {
          should: searchFields,
          minimumShouldMatch: 1
        }
      }
    },
    {
      $addFields: {
        bm25Score: { $meta: "searchScore" }
      }
    },
    { $limit: limit }
  ];

  if (Object.keys(filters).length > 0) {
    pipeline.push({ $match: filters });
  }

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Rerank results using CrossEncoder
 */
async function rerankWithCrossEncoder(query, documents) {
  if (!HF_API_KEY || HF_API_KEY === 'your_huggingface_api_key_here') {
    console.warn('\n⚠️  Warning: No valid Hugging Face API key found!');
    console.warn('   Reranking will be skipped. Get a free key from: https://huggingface.co/settings/tokens');
    console.warn('   Add it to your .env file as HUGGINGFACE_API_KEY\n');
    return null;
  }

  try {
    // Prepare document texts for reranking
    const documentTexts = documents.map(doc => {
      return `${doc.id || ''} - ${doc.title || ''}: ${doc.description || ''} ${doc.steps || ''}`.trim();
    });

    console.log(`🔄 Reranking ${documentTexts.length} documents with CrossEncoder...`);

    const response = await axios.post(
      'https://api-inference.huggingface.co/models/cross-encoder/ms-marco-MiniLM-L-6-v2',
      {
        inputs: {
          source_sentence: query,
          sentences: documentTexts
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data;
  } catch (error) {
    if (error.response?.status === 503) {
      console.error('⚠️  Model is loading on Hugging Face servers. Please wait a moment and try again.');
    } else if (error.response?.status === 401) {
      console.error('❌ Invalid Hugging Face API key. Please check your .env file.');
    } else {
      console.error('❌ Reranking error:', error.message);
    }
    return null;
  }
}

/**
 * Display results
 */
function displayResults(results, title, searchType) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${title}`);
  console.log(`${'='.repeat(80)}\n`);

  results.forEach((result, index) => {
    const score = result.vectorScore || result.bm25Score || result.rerankScore || 0;
    console.log(`${index + 1}. ${result.id}: ${result.title}`);
    console.log(`   📊 Score: ${score.toFixed(4)}`);
    console.log(`   📦 Module: ${result.module || 'N/A'}`);
    
    if (result.originalRank) {
      const rankChange = result.originalRank - (index + 1);
      const arrow = rankChange > 0 ? '↑' : rankChange < 0 ? '↓' : '↔';
      const changeStr = rankChange !== 0 ? `${Math.abs(rankChange)} positions` : 'no change';
      console.log(`   🔄 Rank Change: ${arrow} ${changeStr} (was #${result.originalRank})`);
    }
    
    if (result.description) {
      const desc = result.description.substring(0, 100);
      console.log(`   📝 ${desc}${result.description.length > 100 ? '...' : ''}`);
    }
    console.log();
  });
}

/**
 * Display comparison
 */
function displayComparison(beforeResults, afterResults) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 BEFORE vs AFTER COMPARISON');
  console.log(`${'='.repeat(80)}\n`);

  console.log('┌──────┬─────────────┬──────────────────────────────────────┬──────────┬──────────┐');
  console.log('│ Orig │ Test Case   │ Title                                │ Before   │ After    │');
  console.log('│ Rank │ ID          │                                      │ Score    │ Rank     │');
  console.log('├──────┼─────────────┼──────────────────────────────────────┼──────────┼──────────┤');

  beforeResults.forEach((beforeResult, index) => {
    const afterIndex = afterResults.findIndex(r => r._id.toString() === beforeResult._id.toString());
    const afterRank = afterIndex >= 0 ? afterIndex + 1 : '-';
    const rankChange = afterIndex >= 0 ? (index + 1) - (afterIndex + 1) : 0;
    const arrow = rankChange > 0 ? '↓' : rankChange < 0 ? '↑' : '↔';
    
    const originalRank = (index + 1).toString().padStart(4);
    const testCaseId = (beforeResult.id || 'N/A').padEnd(11);
    const title = (beforeResult.title || 'No title').substring(0, 36).padEnd(36);
    const beforeScore = (beforeResult.vectorScore || beforeResult.bm25Score || 0).toFixed(4);
    const afterRankStr = afterRank !== '-' ? `${arrow} #${afterRank}`.padEnd(8) : 'dropped';

    console.log(`│ ${originalRank} │ ${testCaseId} │ ${title} │ ${beforeScore} │ ${afterRankStr} │`);
  });

  console.log('└──────┴─────────────┴──────────────────────────────────────┴──────────┴──────────┘');

  // Statistics
  const significantChanges = afterResults.filter(r => Math.abs(r.rankChange || 0) >= 5).length;
  const avgScoreImprovement = afterResults.reduce((sum, r) => sum + parseFloat(r.scoreImprovement || 0), 0) / afterResults.length;

  console.log(`\n📈 STATISTICS:`);
  console.log(`   • Top result changed: ${beforeResults[0]?.id !== afterResults[0]?.id ? 'YES ✓' : 'NO'}`);
  console.log(`   • Significant reorderings (±5 positions): ${significantChanges}`);
  console.log(`   • Average score improvement: ${avgScoreImprovement.toFixed(2)}%`);
}

/**
 * Main function
 */
async function main() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Parse command line arguments
    const query = process.argv[2] || "merge UHID";
    const searchType = process.argv[3] || "vector"; // vector or bm25
    const rerankTopK = parseInt(process.argv[4]) || 50;
    const finalLimit = parseInt(process.argv[5]) || 10;

    console.log('\n🔍 CrossEncoder Reranking Search');
    console.log(`${'='.repeat(80)}`);
    console.log(`📝 Query: "${query}"`);
    console.log(`🔎 Search Type: ${searchType.toUpperCase()}`);
    console.log(`📊 Retrieve Top-K: ${rerankTopK} → Rerank → Return Top: ${finalLimit}`);
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now();

    // Step 1: Initial search
    console.log(`\n⏳ Step 1: Performing ${searchType.toUpperCase()} search for top ${rerankTopK} candidates...`);
    
    let initialResults;
    let embeddingCost = 0;
    let embeddingTokens = 0;

    if (searchType === 'vector') {
      const embeddingData = await generateQueryEmbedding(query);
      initialResults = await vectorSearch(collection, embeddingData.embedding, rerankTopK);
      embeddingCost = embeddingData.cost;
      embeddingTokens = embeddingData.tokens;
    } else {
      initialResults = await bm25Search(collection, query, rerankTopK);
    }

    const searchTime = Date.now() - startTime;
    console.log(`✅ Found ${initialResults.length} candidates in ${searchTime}ms`);

    // Step 2: Rerank with CrossEncoder
    console.log(`\n⏳ Step 2: Reranking with CrossEncoder...`);
    const rerankStartTime = Date.now();
    
    const rerankScores = await rerankWithCrossEncoder(query, initialResults);
    
    if (!rerankScores) {
      console.log('\n⚠️  Reranking skipped. Showing original results only.\n');
      displayResults(initialResults.slice(0, finalLimit), `TOP ${finalLimit} RESULTS (${searchType.toUpperCase()})`, searchType);
      return;
    }

    const rerankingTime = Date.now() - rerankStartTime;
    console.log(`✅ Reranking complete in ${rerankingTime}ms`);

    // Step 3: Combine and sort by rerank scores
    const rerankedResults = initialResults.map((doc, index) => ({
      ...doc,
      originalRank: index + 1,
      originalScore: doc.vectorScore || doc.bm25Score || 0,
      rerankScore: rerankScores[index],
      scoreImprovement: ((rerankScores[index] - (doc.vectorScore || doc.bm25Score || 0)) * 100).toFixed(2)
    }));

    rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);

    // Add new rank and rank change
    rerankedResults.forEach((doc, index) => {
      doc.newRank = index + 1;
      doc.rankChange = doc.originalRank - doc.newRank;
    });

    const finalResults = rerankedResults.slice(0, finalLimit);
    const totalTime = Date.now() - startTime;

    // Display results
    displayResults(initialResults.slice(0, finalLimit), `BEFORE RERANKING - Top ${finalLimit} ${searchType.toUpperCase()} Results`, searchType);
    displayResults(finalResults, `AFTER RERANKING - Top ${finalLimit} CrossEncoder Results`, 'rerank');
    displayComparison(initialResults.slice(0, finalLimit), finalResults);

    console.log(`\n⏱️  TIMING BREAKDOWN:`);
    console.log(`   • ${searchType.toUpperCase()} Search: ${searchTime}ms`);
    console.log(`   • CrossEncoder Reranking: ${rerankingTime}ms`);
    console.log(`   • Total Time: ${totalTime}ms`);
    
    if (embeddingCost > 0) {
      console.log(`\n💰 COST:`);
      console.log(`   • Embedding Cost: $${embeddingCost.toFixed(6)}`);
      console.log(`   • Tokens Used: ${embeddingTokens}`);
    }

    console.log(`\n✅ Search complete!\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { rerankWithCrossEncoder, vectorSearch, bm25Search };

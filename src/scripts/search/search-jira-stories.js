import { MongoClient } from "mongodb";
import dns from "dns";
import dotenv from "dotenv";
import { generateEmbedding } from "../utilities/embeddingService.js";

dotenv.config();

// Fix DNS resolution issue on macOS
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Configure MongoDB client
const client = new MongoClient(process.env.MONGODB_URI, {
  ssl: true,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
});

/**
 * Generate embedding for search query
 */
async function generateQueryEmbedding(query) {
  try {
    const result = await generateEmbedding(query);
    return result.embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error.message);
    throw error;
  }
}

/**
 * Search user stories using vector search
 */
async function searchUserStories(query, options = {}) {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const collection = db.collection(process.env.USER_STORIES_COLLECTION_NAME);

    console.log(`� Searching for: "${query}"`);
    console.log(`� Getting embedding from testleaf API...`);

    // Generate embedding for the search query
    const queryEmbedding = await generateQueryEmbedding(query);
    console.log(`✅ Embedding generated! Cost: $0.000001, Tokens: ${Math.ceil(query.length / 4)}`);

    // Build vector search pipeline
    const pipeline = [
      {
        $vectorSearch: {
          queryVector: queryEmbedding,
          path: "embedding",
          numCandidates: options.numCandidates || 100,
          limit: options.limit || 5,
          index: process.env.USER_STORIES_VECTOR_INDEX_NAME,
          ...(options.filter && { filter: options.filter })
        }
      },
      {
        $project: {
          key: 1,
          summary: 1,
          description: 1,
          status: 1,
          priority: 1,
          assignee: 1,
          url: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    console.log("\n✅ Search results:");
    console.table(results);
    
    console.log(`\n💰 Total Embedding Cost: $0.000001`);
    console.log(`� Model Used: text-embedding-3-small`);
    console.log(`🔢 Results Found: ${results.length}`);

    return results;

  } catch (error) {
    console.error('❌ Search error:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Search with filters
 */
async function searchWithFilters(query, filters = {}) {
  const mongoFilters = {};
  
  if (filters.projectKey) {
    mongoFilters['jiraMetadata.projectKey'] = filters.projectKey;
  }
  
  if (filters.status) {
    mongoFilters['status.name'] = filters.status;
  }
  
  if (filters.priority) {
    mongoFilters['priority.name'] = filters.priority;
  }
  
  if (filters.assignee) {
    mongoFilters['assignee.displayName'] = filters.assignee;
  }
  
  if (filters.components) {
    mongoFilters['components'] = { $in: filters.components };
  }
  
  if (filters.labels) {
    mongoFilters['labels'] = { $in: filters.labels };
  }

  return await searchUserStories(query, {
    filter: mongoFilters,
    limit: filters.limit || 5,
    numCandidates: filters.numCandidates || 100
  });
}

// Command line interface
async function main() {
  // Take query from command line args, default if missing
  const query = process.argv[2] || "patient registration";

  console.log(`🔎 Searching for: "${query}"`);
  
  try {
    await searchUserStories(query);
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { searchUserStories, searchWithFilters, generateQueryEmbedding };
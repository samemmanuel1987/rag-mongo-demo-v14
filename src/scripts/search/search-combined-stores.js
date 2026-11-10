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
    return {
      embedding: result.embedding,
      cost: (result.usage?.total_tokens || 0) / 1000000 * 0.10,
      tokens: result.usage?.total_tokens || 0,
      model: result.model
    };
  } catch (error) {
    console.error('Error generating query embedding:', error.message);
    throw error;
  }
}

/**
 * Search test cases collection
 */
async function searchTestCases(db, queryEmbedding, limit = 3) {
  const collection = db.collection(process.env.COLLECTION_NAME);
  
  const pipeline = [
    {
      $vectorSearch: {
        queryVector: queryEmbedding,
        path: "embedding",
        numCandidates: 50,
        limit: limit,
        index: process.env.VECTOR_INDEX_NAME
      }
    },
    {
      $project: {
        id: 1,
        title: 1,
        // description: 1,
        // steps: 1,
        // expectedResults: 1,
        // module: 1,
        score: { $meta: "vectorSearchScore" },
        sourceType: { $literal: "testcase" }
      }
    }
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Search user stories collection
 */
async function searchUserStories(db, queryEmbedding, limit = 3) {
  const collection = db.collection(process.env.USER_STORIES_COLLECTION_NAME);
  
  const pipeline = [
    {
      $vectorSearch: {
        queryVector: queryEmbedding,
        path: "embedding",
        numCandidates: 50,
        limit: limit,
        index: process.env.USER_STORIES_VECTOR_INDEX_NAME
      }
    },
    {
      $project: {
        key: 1,
        summary: 1,
        // description: 1,
        // status: 1,
        // priority: 1,
        // assignee: 1,
        // url: 1,
        score: { $meta: "vectorSearchScore" },
        sourceType: { $literal: "userstory" }
      }
    }
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Search across both collections and combine results
 */
async function searchCombined(query, options = {}) {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);

    console.log(`🔎 Searching for: "${query}"`);
    console.log(`🔄 Getting embedding from testleaf API...`);

    // Generate embedding for the search query
    const embeddingResult = await generateQueryEmbedding(query);
    console.log(`✅ Embedding generated! Cost: $${embeddingResult.cost}, Tokens: ${embeddingResult.tokens}`);

    const limit = options.limit || 5;
    const testCaseLimit = Math.ceil(limit / 2);
    const userStoryLimit = Math.floor(limit / 2);

    // Search both collections concurrently
    console.log(`🔄 Searching test cases and user stories...`);
    const [testCases, userStories] = await Promise.all([
      searchTestCases(db, embeddingResult.embedding, testCaseLimit),
      searchUserStories(db, embeddingResult.embedding, userStoryLimit)
    ]);

    // Combine and sort results by score
    const allResults = [...testCases, ...userStories]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log("\n✅ Search results:");
    console.table(allResults);
    
    console.log(`\n💰 Total Embedding Cost: $${embeddingResult.cost}`);
    console.log(`📈 Model Used: ${embeddingResult.model}`);
    console.log(`🔢 Results Found: ${allResults.length} (${testCases.length} test cases, ${userStories.length} user stories)`);

    return {
      combined: allResults,
      testCases,
      userStories,
      metadata: {
        cost: embeddingResult.cost,
        tokens: embeddingResult.tokens,
        model: embeddingResult.model
      }
    };

  } catch (error) {
    console.error('❌ Search error:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Search with detailed breakdown
 */
async function searchWithBreakdown(query, options = {}) {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);

    console.log(`🔎 Searching for: "${query}"`);
    console.log(`🔄 Getting embedding from testleaf API...`);

    // Generate embedding for the search query
    const embeddingResult = await generateQueryEmbedding(query);
    console.log(`✅ Embedding generated! Cost: $${embeddingResult.cost}, Tokens: ${embeddingResult.tokens}`);

    const limit = options.limit || 5;

    // Search both collections with equal limits
    const [testCases, userStories] = await Promise.all([
      searchTestCases(db, embeddingResult.embedding, limit),
      searchUserStories(db, embeddingResult.embedding, limit)
    ]);

    console.log("\n📋 TEST CASES:");
    if (testCases.length > 0) {
      console.table(testCases);
    } else {
      console.log("   No test cases found");
    }

    console.log("\n📋 USER STORIES:");
    if (userStories.length > 0) {
      console.table(userStories);
    } else {
      console.log("   No user stories found");
    }
    
    console.log(`\n💰 Total Embedding Cost: $${embeddingResult.cost}`);
    console.log(`📈 Model Used: ${embeddingResult.model}`);
    console.log(`🔢 Results Found: ${testCases.length + userStories.length} total (${testCases.length} test cases, ${userStories.length} user stories)`);

    return {
      testCases,
      userStories,
      metadata: {
        cost: embeddingResult.cost,
        tokens: embeddingResult.tokens,
        model: embeddingResult.model
      }
    };

  } catch (error) {
    console.error('❌ Search error:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

// Command line interface
async function main() {
  // Take query from command line args, default if missing
  const query = process.argv[2] || "patient registration";
  const mode = process.argv[3] || "combined"; // "combined" or "breakdown"

  try {
    if (mode === "breakdown") {
      await searchWithBreakdown(query);
    } else {
      await searchCombined(query);
    }
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { searchCombined, searchWithBreakdown, searchTestCases, searchUserStories };
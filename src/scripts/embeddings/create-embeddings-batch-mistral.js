import { MongoClient } from "mongodb";
import dns from "dns";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { generateBatchEmbeddings } from "../utilities/mistralEmbedding.js";

dotenv.config();

// Fix DNS resolution issue on macOS by using Google's DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Configure MongoDB client with SSL options
const client = new MongoClient(process.env.MONGODB_URI, {
  ssl: true,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  maxPoolSize: 20
});

// BATCH PROCESSING CONFIGURATION - Optimized for Mistral AI
const BATCH_SIZE = 50; // Process 50 testcases per batch
const CONCURRENT_LIMIT = 2; // Max 2 concurrent batch API calls to stay within rate limits
const DELAY_BETWEEN_BATCHES = 1000; // 1000ms delay between batches
const MONGODB_BATCH_SIZE = 100; // Insert 100 documents at once

// Create limiters for different operations
const embeddingLimit = pLimit(CONCURRENT_LIMIT);
const dbLimit = pLimit(3);

/**
 * Generate embeddings for a batch of testcases using Mistral AI
 */
async function generateBatchEmbeddingsForTestcases(testcaseBatch, batchNumber, totalBatches, maxRetries = 3) {
  return embeddingLimit(async () => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Prepare input texts for batch processing
        const inputs = testcaseBatch.map(testcase => `
          ID: ${testcase.id}
          Module: ${testcase.module}
          Title: ${testcase.title}
          Description: ${testcase.description}
          Steps: ${testcase.steps}
          Expected Result: ${testcase.expectedResults}
        `.trim());

        console.log(`🚀 [Batch ${batchNumber}/${totalBatches}] Processing ${testcaseBatch.length} testcases with Mistral AI...`);

        // Use Mistral AI batch embeddings
        const embeddingResult = await generateBatchEmbeddings(inputs);

        if (!embeddingResult || !embeddingResult.embeddings) {
          throw new Error(`Mistral API error: Invalid response`);
        }

        const embeddings = embeddingResult.embeddings;
        const totalTokens = embeddingResult.usage?.total_tokens || 0;
        const model = embeddingResult.model;

        // Estimate cost (Mistral pricing: ~$0.10 per 1M tokens)
        const estimatedCost = (totalTokens / 1000000) * 0.10;

        // Map embeddings back to testcases
        const results = testcaseBatch.map((testcase, index) => ({
          testcase,
          embedding: embeddings[index],
          cost: estimatedCost / testcaseBatch.length,
          tokens: Math.round(totalTokens / testcaseBatch.length),
          metadata: {
            model: model,
            cost: estimatedCost / testcaseBatch.length,
            tokens: Math.round(totalTokens / testcaseBatch.length),
            apiSource: 'mistral-batch',
            batchNumber: batchNumber,
            createdAt: new Date()
          }
        }));

        console.log(`✅ [Batch ${batchNumber}/${totalBatches}] Success! Cost: $${estimatedCost.toFixed(6)} | Tokens: ${totalTokens}`);

        return {
          success: true,
          results: results,
          totalCost: estimatedCost,
          totalTokens: totalTokens,
          batchSize: testcaseBatch.length
        };

      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`⚠️ [Batch ${batchNumber}/${totalBatches}] Retry ${attempt}/${maxRetries}: ${error.message}`);
          console.log(`   Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error(`❌ [Batch ${batchNumber}/${totalBatches}] Final failure: ${lastError.message}`);
    return {
      success: false,
      error: lastError.message,
      results: testcaseBatch.map(testcase => ({
        testcase,
        error: lastError.message,
        cost: 0,
        tokens: 0
      })),
      totalCost: 0,
      totalTokens: 0,
      batchSize: testcaseBatch.length
    };
  });
}

/**
 * Optimized batch MongoDB insertion
 */
async function insertTestcasesBatch(collection, batch) {
  return dbLimit(async () => {
    if (batch.length === 0) return { inserted: 0, failed: 0 };

    const documents = batch
      .filter(item => !item.error)
      .map(item => {
        const { _id, ...cleanTc } = item.testcase;
        return {
          ...cleanTc,
          embedding: item.embedding,
          createdAt: new Date(),
          embeddingMetadata: item.metadata
        };
      });

    if (documents.length === 0) {
      return { inserted: 0, failed: batch.length };
    }

    try {
      const result = await collection.insertMany(documents, {
        ordered: false,
        writeConcern: { w: 1 }
      });

      const failed = batch.length - documents.length;
      return { inserted: result.insertedCount, failed };

    } catch (error) {
      console.error(`❌ Batch insert failed:`, error.message);
      return { inserted: 0, failed: batch.length };
    }
  });
}

/**
 * Progress tracking with ETA calculation
 */
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.processed = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.totalCost = 0;
    this.totalTokens = 0;
  }

  update(processed, cost = 0, tokens = 0) {
    this.processed = processed;
    this.totalCost += cost;
    this.totalTokens += tokens;

    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    const rate = this.processed / elapsed;
    const remaining = this.total - this.processed;
    const eta = remaining / rate;

    if (now - this.lastUpdate > 15000 || this.processed === this.total) {
      console.log(`📊 Progress: ${this.processed}/${this.total} (${(this.processed / this.total * 100).toFixed(1)}%) | Rate: ${rate.toFixed(1)}/sec | ETA: ${this.formatTime(eta)} | Cost: $${this.totalCost.toFixed(6)}`);
      this.lastUpdate = now;
    }
  }

  formatTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
}

async function processSingleFile(db, collection, inputFilePath, overallStats) {
  if (!fs.existsSync(inputFilePath)) {
    console.error(`⚠️ Input file not found: ${inputFilePath}`);
    return;
  }

  console.log(`\n📂 Loading test cases from: ${inputFilePath}`);
  const rawContent = fs.readFileSync(inputFilePath, "utf-8");
  let testcases = [];
  try {
    testcases = JSON.parse(rawContent);
  } catch (err) {
    console.error(`❌ Failed to parse JSON in ${inputFilePath}: ${err.message}`);
    return;
  }

  if (!Array.isArray(testcases) || testcases.length === 0) {
    console.log(`⚠️ No test cases found in ${inputFilePath}`);
    return;
  }

  const progress = new ProgressTracker(testcases.length);

  console.log(`🚀 PROCESSING ${testcases.length} test cases from ${path.basename(inputFilePath)}`);
  console.log(`⚙️  Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENT_LIMIT}`);

  const batches = [];
  for (let i = 0; i < testcases.length; i += BATCH_SIZE) {
    batches.push({
      testcases: testcases.slice(i, i + BATCH_SIZE),
      batchNumber: Math.floor(i / BATCH_SIZE) + 1
    });
  }

  const totalBatches = batches.length;
  let fileCost = 0;
  let fileTokens = 0;
  let fileInserted = 0;
  let fileFailed = 0;
  let processedCount = 0;

  for (let i = 0; i < batches.length; i += CONCURRENT_LIMIT) {
    const concurrentBatches = batches.slice(i, i + CONCURRENT_LIMIT);

    const batchPromises = concurrentBatches.map(batch =>
      generateBatchEmbeddingsForTestcases(batch.testcases, batch.batchNumber, totalBatches)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const batchResult of batchResults) {
      if (batchResult.status === 'fulfilled') {
        const result = batchResult.value;

        if (result.success) {
          processedCount += result.batchSize;
          fileCost += result.totalCost;
          fileTokens += result.totalTokens;
          progress.update(processedCount, result.totalCost, result.totalTokens);

          const successfulEmbeddings = result.results.filter(item => !item.error);

          if (successfulEmbeddings.length > 0) {
            for (let j = 0; j < successfulEmbeddings.length; j += MONGODB_BATCH_SIZE) {
              const subBatch = successfulEmbeddings.slice(j, j + MONGODB_BATCH_SIZE);
              const insertResult = await insertTestcasesBatch(collection, subBatch);
              fileInserted += insertResult.inserted;
              fileFailed += insertResult.failed;
            }
          }

          fileFailed += (result.batchSize - successfulEmbeddings.length);
        } else {
          processedCount += result.batchSize;
          fileFailed += result.batchSize;
          progress.update(processedCount, 0, 0);
          console.error(`❌ Batch failed: ${result.error}`);
        }
      } else {
        console.error(`❌ Batch promise rejected:`, batchResult.reason);
      }
    }

    if (i + CONCURRENT_LIMIT < batches.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  overallStats.totalTestcases += testcases.length;
  overallStats.totalInserted += fileInserted;
  overallStats.totalFailed += fileFailed;
  overallStats.totalCost += fileCost;
  overallStats.totalTokens += fileTokens;

  console.log(`✅ Finished ${path.basename(inputFilePath)}: ${fileInserted} inserted, ${fileFailed} failed.`);
}

async function main() {
  const overallStart = Date.now();

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Determine input files: use EMBEDDING_INPUT_FILES env var or CLI args, or fallback to all JSON in src/data
    const inputEnv = process.env.EMBEDDING_INPUT_FILES;
    let fileList = [];

    if (inputEnv) {
      fileList = inputEnv.split(',').map(f => f.trim()).filter(Boolean);
    } else if (process.argv[2]) {
      fileList = [process.argv[2]];
    } else {
      fileList = fs.readdirSync('src/data')
        .filter(f => f.endsWith('.json') && !f.startsWith('stories'));
    }

    console.log(`🚀 Starting Test Cases Batch Processing for ${fileList.length} file(s):`);
    fileList.forEach((f, idx) => console.log(`   ${idx + 1}. ${f}`));

    const overallStats = {
      totalTestcases: 0,
      totalInserted: 0,
      totalFailed: 0,
      totalCost: 0,
      totalTokens: 0
    };

    for (const fileName of fileList) {
      const fullPath = fileName.startsWith('src/data') || fileName.startsWith('src\\data')
        ? fileName
        : `src/data/${path.basename(fileName)}`;
      await processSingleFile(db, collection, fullPath, overallStats);
    }

    const totalTime = (Date.now() - overallStart) / 1000;
    const rate = overallStats.totalTestcases > 0 ? overallStats.totalTestcases / totalTime : 0;

    console.log(`\n🎉 BATCH PROCESSING COMPLETE!`);
    console.log(`📊 Summary Statistics:`);
    console.log(`   ⏱️  Total Time: ${((totalTime)).toFixed(1)}s`);
    console.log(`   ⚡ Processing Rate: ${rate.toFixed(1)} testcases/second`);
    console.log(`   📝 Total Test Cases: ${overallStats.totalTestcases}`);
    console.log(`   ✅ Successfully Inserted: ${overallStats.totalInserted}`);
    console.log(`   ❌ Failed: ${overallStats.totalFailed}`);
    console.log(`   💰 Total Cost: $${overallStats.totalCost.toFixed(6)}`);
    console.log(`   🔢 Total Tokens: ${overallStats.totalTokens.toLocaleString()}`);

  } catch (err) {
    console.error("❌ Fatal Processing Error:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { spawn, execSync } from 'child_process';
import xlsx from 'xlsx';
import { MongoClient } from 'mongodb';
import dns from 'dns';
import axios from 'axios';
import { generateEmbedding, generateBatchEmbeddings, testEmbeddingConnection, EMBEDDING_PRESETS, getEmbeddingConfig } from '../src/scripts/utilities/embeddingService.js';
import { rerankDocuments, summarizeResults, generateAnswer, chatCompletion, testLLMConnection, PROVIDER_PRESETS, getLLMConfig, parseAndRepairLlmOutput } from '../src/scripts/utilities/llmService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Configure custom DNS only if explicitly requested (e.g., macOS DNS resolution quirks)
if (process.platform === 'darwin' && process.env.ENABLE_CUSTOM_DNS === 'true') {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// ======================== Job Tracking ========================
const JOBS_FILE = path.join(__dirname, '../uploads/.jobs_state.json');
const jobs = new Map();

// Initialize jobs from disk if available
try {
  if (fs.existsSync(JOBS_FILE)) {
    const raw = fs.readFileSync(JOBS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [id, val] of Object.entries(parsed)) {
      jobs.set(id, val);
    }
  }
} catch (e) {
  console.warn('⚠️ Could not load jobs state from disk:', e.message);
}

function saveJobsToDisk() {
  try {
    const obj = {};
    for (const [id, val] of jobs.entries()) {
      obj[id] = val;
    }
    fs.writeFileSync(JOBS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    // ignore disk write errors
  }
}

function createJob(files) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newJob = {
    id: jobId,
    files,
    status: 'in-progress',
    progress: 0,
    total: files.length,
    results: [],
    startTime: new Date(),
    currentFile: files[0] || null,
    message: 'Starting batch job...'
  };
  jobs.set(jobId, newJob);
  saveJobsToDisk();
  return jobId;
}

function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    jobs.set(jobId, job);
    saveJobsToDisk();
  }
}

function getJob(jobId) {
  if (!jobs.has(jobId)) {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const raw = fs.readFileSync(JOBS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed[jobId]) {
          jobs.set(jobId, parsed[jobId]);
        }
      }
    } catch (e) {}
  }
  return jobs.get(jobId);
}

// Clean up old jobs (older than 24 hours)
setInterval(() => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.startTime).getTime() < oneDayAgo) {
      jobs.delete(jobId);
      changed = true;
    }
  }
  if (changed) saveJobsToDisk();
}, 10 * 60 * 1000);

// ======================== Validation Helpers ========================

async function validateDbCollectionIndex(client, dbName, collectionName, indexName, requireDocuments = false) {
  try {
    const db = client.db(dbName);

    // If documents or search index are required, verify collection exists
    if (requireDocuments || indexName) {
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (!collections || collections.length === 0) {
        return { ok: false, error: `Collection '${collectionName}' not found in database '${dbName}'` };
      }

      if (requireDocuments) {
        const count = await db.collection(collectionName).countDocuments();
        if (count === 0) {
          return { ok: false, error: `No documents found in collection '${collectionName}'. Please create embeddings first.` };
        }
      }

      // Verify Atlas Search indexes (listSearchIndexes command)
      if (indexName) {
        try {
          const collection = db.collection(collectionName);
          const indexes = await collection.listSearchIndexes().toArray();
          if (indexes && Array.isArray(indexes)) {
            const found = indexes.some(idx => idx.name === indexName);
            if (!found) {
              return { ok: false, error: `Search index '${indexName}' not found for collection '${collectionName}'` };
            }
          }
        } catch (err) {
          // If listSearchIndexes fails due to permissions or cluster tier, log warning but don't hard-block
          console.warn(`⚠️ Could not verify search index '${indexName}': ${err.message}`);
        }
      }
    }

    return { ok: true };

  } catch (err) {
    return { ok: false, error: `Validation failed: ${err.message}` };
  }
}

// ======================== API Routes ========================

// Root API endpoint - returns API info and available endpoints
app.get('/api', (req, res) => {
  res.json({
    status: 'OK',
    message: 'RAG MongoDB Demo API is running',
    version: '1.0.0',
    endpoints: {
      health:                'GET  /api/health',
      jobs:                  'GET  /api/jobs/active',
      jobStatus:             'GET  /api/jobs/:jobId',
      metadata:              'GET  /api/metadata/distinct',
      files:                 'GET  /api/files',
      uploadExcel:           'POST /api/upload-excel',
      createEmbeddings:      'POST /api/create-embeddings',
      createEmbeddingsBatch: 'POST /api/create-embeddings-batch',
      searchVector:          'POST /api/search',
      searchBm25:            'POST /api/search/bm25',
      searchHybrid:          'POST /api/search/hybrid',
      searchUserStories:     'POST /api/search/user-stories',
      searchRerank:          'POST /api/search/rerank',
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Get active jobs
app.get('/api/jobs/active', (req, res) => {
  const activeJobs = Array.from(jobs.values()).filter(job => job.status === 'in-progress');
  res.json({ jobs: activeJobs });
});

// Get job status
app.get('/api/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Get distinct metadata values for filters
app.get('/api/metadata/distinct', async (req, res) => {
  try {
    console.log('🔍 Fetching distinct metadata values...');
    console.log('📊 DB Name:', process.env.DB_NAME);
    console.log('📊 Collection Name:', process.env.COLLECTION_NAME);

    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Check document count first
    const count = await collection.countDocuments();
    console.log(`📊 Total documents in collection: ${count}`);

    if (count === 0) {
      console.log('⚠️ Collection is empty! No documents found.');
      await mongoClient.close();
      return res.json({
        success: true,
        metadata: {
          modules: [],
          priorities: [],
          risks: [],
          types: []
        },
        message: 'Collection is empty. Please create embeddings first.'
      });
    }

    // Get a sample document to see what fields exist
    const sampleDoc = await collection.findOne({});
    console.log('📄 Sample document fields:', Object.keys(sampleDoc || {}));
    console.log('📄 Sample document:', JSON.stringify(sampleDoc, null, 2));

    const modules = await collection.distinct('module');
    const priorities = await collection.distinct('priority');
    const risks = await collection.distinct('risk');
    const types = await collection.distinct('automationManual');

    console.log(`✅ Found ${modules.length} modules:`, modules);
    console.log(`✅ Found ${priorities.length} priorities:`, priorities);
    console.log(`✅ Found ${risks.length} risks:`, risks);
    console.log(`✅ Found ${types.length} types:`, types);

    await mongoClient.close();

    const metadata = {
      modules: modules.filter(Boolean).sort(),
      priorities: priorities.filter(Boolean).sort(),
      risks: risks.filter(Boolean).sort(),
      types: types.filter(Boolean).sort()
    };

    console.log('📤 Sending metadata:', metadata);

    res.json({
      success: true,
      metadata
    });

  } catch (error) {
    console.error('❌ Error fetching metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata', details: error.message });
  }
});

// Get all files in data directory
app.get('/api/files', (req, res) => {
  try {
    const dataPath = path.join(__dirname, '../src/data');
    const files = fs.readdirSync(dataPath)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(dataPath, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          type: 'json'
        };
      });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read files', details: error.message });
  }
});

// ======================== Excel Conversion Helpers ========================
const userStoryColumnMap = {
  "storyId": "key",
  "Story Key": "key",
  "Story ID": "key",
  "ID": "key",
  "Key": "key",
  "Issue Key": "key",
  "key": "key",
  "summary": "summary",
  "Summary": "summary",
  "Title": "summary",
  "Story Title": "summary",
  "User Story": "summary",
  "Story Summary": "summary",
  "description": "description",
  "Description": "description",
  "Story Description": "description",
  "Details": "description",
  "User Story Description": "description",
  "statusCategory": "status",
  "Status": "status",
  "Story Status": "status",
  "Issue Status": "status",
  "status": "status",
  "priority": "priority",
  "Priority": "priority",
  "Story Priority": "priority",
  "Issue Priority": "priority",
  "assignee": "assignee",
  "Assignee": "assignee",
  "Assigned To": "assignee",
  "reporter": "reporter",
  "Reporter": "reporter",
  "Created By": "reporter",
  "createdDate": "created",
  "Created": "created",
  "Created Date": "created",
  "Creation Date": "created",
  "created": "created",
  "updatedDate": "updated",
  "Updated": "updated",
  "Updated Date": "updated",
  "Last Modified": "updated",
  "Last Modified Date": "updated",
  "updated": "updated",
  "projectName": "project",
  "Project": "project",
  "Project Key": "project",
  "Project Name": "project",
  "project": "project",
  "parentSummary": "epic",
  "Epic": "epic",
  "Epic Link": "epic",
  "Epic Name": "epic",
  "epic": "epic",
  "storyPoints": "storyPoints",
  "Story Points": "storyPoints",
  "Points": "storyPoints",
  "Estimate": "storyPoints",
  "Effort": "storyPoints",
  "Story Point Estimate": "storyPoints",
  "components": "components",
  "Components": "components",
  "Component": "components",
  "labels": "labels",
  "Labels": "labels",
  "Tags": "labels",
  "fixVersions": "fixVersions",
  "Fix Version": "fixVersions",
  "Fix Versions": "fixVersions",
  "Target Version": "fixVersions",
  "Release": "fixVersions",
  "Version": "fixVersions",
  "acceptanceCriteria": "acceptanceCriteria",
  "Acceptance Criteria": "acceptanceCriteria",
  "AC": "acceptanceCriteria",
  "Definition of Done": "acceptanceCriteria",
  "Acceptance": "acceptanceCriteria",
  "businessValue": "businessValue",
  "Business Value": "businessValue",
  "risk": "risk",
  "Risk": "risk",
  "dependencies": "dependencies",
  "Dependencies": "dependencies",
  "notes": "notes",
  "Notes": "notes",
  "Comments": "notes",
  "Remarks": "notes",
  "Sprint": "sprint",
  "Current Sprint": "sprint",
  "Sprint Name": "sprint",
  "sprint": "sprint",
  "Team": "team",
  "Squad": "team",
  "Development Team": "team",
  "team": "team"
};

const testCaseColumnMap = {
  // Module
  "module": "module",
  "Module": "module",
  "Component": "module",
  "Feature": "module",
  "Section": "module",
  "Category": "module",
  "Test Suite": "module",
  "Suite": "module",

  // ID
  "testCaseId": "id",
  "Test ID": "id",
  "Test Case ID": "id",
  "TestCase ID": "id",
  "ID": "id",
  "id": "id",
  "TestID": "id",
  "test_case_id": "id",
  "testcase_id": "id",
  "TC ID": "id",
  "tc_id": "id",
  "TC_ID": "id",
  "Key": "id",

  // Pre-Requisites
  "preRequisites": "preRequisites",
  "Pre-Requisites": "preRequisites",
  "Prerequisites": "preRequisites",
  "Pre-requisites": "preRequisites",
  "Pre Requisites": "preRequisites",
  "pre_requisites": "preRequisites",
  "Pre conditions": "preRequisites",
  "Preconditions": "preRequisites",
  "Pre-condition": "preRequisites",
  "Pre Condition": "preRequisites",
  "preConditions": "preRequisites",

  // Title
  "title": "title",
  "Test Title": "title",
  "Title": "title",
  "Test Name": "title",
  "Name": "title",
  "Summary": "title",
  "test_title": "title",
  "TestCase Title": "title",
  "Test Case Name": "title",

  // Description
  "description": "description",
  "Test Case Description": "description",
  "Description": "description",
  "Test Description": "description",
  "Details": "description",
  "test_description": "description",
  "Objective": "description",
  "Test Objective": "description",

  // Steps
  "steps": "steps",
  "Test Steps": "steps",
  "Steps": "steps",
  "Test Step": "steps",
  "Execution Steps": "steps",
  "Action": "steps",
  "Actions": "steps",
  "test_steps": "steps",
  "Test Execution Steps": "steps",
  "Steps to Reproduce": "steps",

  // Expected Results
  "expectedResults": "expectedResults",
  "Expected Results": "expectedResults",
  "Expected Result": "expectedResults",
  "Expected Output": "expectedResults",
  "expected_results": "expectedResults",
  "Expected": "expectedResults",
  "Result": "expectedResults",
  "Expected Behavior": "expectedResults",
  "expectedResult": "expectedResults",

  // Automation/Manual
  "automationManual": "automationManual",
  "Automation/Manual": "automationManual",
  "Automation / Manual": "automationManual",
  "Automated/Manual": "automationManual",
  "Execution Type": "automationManual",
  "automation_manual": "automationManual",
  "Automation Status": "automationManual",
  "Type of Testing": "automationManual",
  "Execution": "automationManual",
  "Mode": "automationManual",

  // Priority
  "priority": "priority",
  "Priority": "priority",
  "Severity": "priority",
  "severity": "priority",
  "Pri": "priority",

  // Created By
  "createdBy": "createdBy",
  "Created By": "createdBy",
  "Author": "createdBy",
  "Creator": "createdBy",
  "created_by": "createdBy",
  "Reporter": "createdBy",
  "Owner": "createdBy",

  // Created Date
  "createdDate": "createdDate",
  "Created Date": "createdDate",
  "Created": "createdDate",
  "Date Created": "createdDate",
  "created_date": "createdDate",
  "Creation Date": "createdDate",

  // Last Modified Date
  "lastModifiedDate": "lastModifiedDate",
  "Last modified date": "lastModifiedDate",
  "Last Modified Date": "lastModifiedDate",
  "Updated Date": "lastModifiedDate",
  "Updated": "lastModifiedDate",
  "last_modified_date": "lastModifiedDate",
  "Modified Date": "lastModifiedDate",
  "Last Modified": "lastModifiedDate",

  // Linked Stories
  "linkedStories": "linkedStories",
  "Linked Stories": "linkedStories",
  "Story ID": "linkedStories",
  "User Story": "linkedStories",
  "Stories": "linkedStories",
  "linked_stories": "linkedStories",
  "Jira ID": "linkedStories",
  "Issue Key": "linkedStories",
  "Linked Story": "linkedStories",

  // Risk
  "risk": "risk",
  "Risk": "risk",
  "Risk Level": "risk",
  "risk_level": "risk",

  // Version
  "version": "version",
  "Version": "version",
  "Release": "version",
  "Target Version": "version",
  "Fix Version": "version",

  // Type
  "type": "type",
  "Type": "type",
  "Test Type": "type",
  "Testing Type": "type",
  "test_type": "type"
};

function parseArrayField(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

function getStatusCategory(status) {
  if (!status) return 'To Do';
  const statusLower = String(status).toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed') || statusLower.includes('resolved')) {
    return 'Done';
  } else if (statusLower.includes('progress') || statusLower.includes('dev') || statusLower.includes('testing') || statusLower.includes('review')) {
    return 'In Progress';
  } else {
    return 'To Do';
  }
}

function getPriorityId(priority) {
  if (!priority) return '3';
  const priorityMap = {
    'highest': '1',
    'high': '2', 
    'medium': '3',
    'low': '4',
    'lowest': '5'
  };
  return priorityMap[String(priority).toLowerCase()] || '3';
}

function formatExcelDate(dateString) {
  if (dateString === null || dateString === undefined || dateString === '') return null;
  if (dateString instanceof Date) {
    return dateString.toISOString();
  }
  if (typeof dateString === 'number') {
    try {
      const date = new Date((dateString - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {}
    return null;
  }
  if (typeof dateString === 'string') {
    if (dateString.trim() === '') return null;
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {}
    return dateString;
  }
  return null;
}

function transformTestCaseRow(row, index) {
  const mappedRow = {
    module: "",
    id: "",
    preRequisites: "",
    title: "",
    description: "",
    steps: "",
    expectedResults: "",
    automationManual: "",
    priority: "",
    createdBy: "",
    createdDate: "",
    lastModifiedDate: "",
    linkedStories: "",
    risk: "",
    version: "",
    type: ""
  };

  // Map columns using normalized key lookup
  for (const [key, val] of Object.entries(row)) {
    if (val === undefined || val === null || val === '') continue;
    const trimmedKey = key.trim();
    const mappedKey = testCaseColumnMap[trimmedKey] || testCaseColumnMap[trimmedKey.toLowerCase()];
    if (mappedKey) {
      mappedRow[mappedKey] = typeof val === 'string' ? val.trim() : val;
    } else {
      mappedRow[trimmedKey] = typeof val === 'string' ? val.trim() : val;
    }
  }

  // Generate fallback ID if missing
  if (!mappedRow.id) {
    mappedRow.id = `TC_${String(index + 1).padStart(3, '0')}`;
  }

  return mappedRow;
}

function transformUserStoryRow(rawRow, index) {
  const mappedRow = {};
  for (const [key, val] of Object.entries(rawRow)) {
    if (val === undefined || val === null || val === '') continue;
    const trimmedKey = key.trim();
    const mappedKey = userStoryColumnMap[trimmedKey] || userStoryColumnMap[trimmedKey.toLowerCase()];
    if (mappedKey) {
      mappedRow[mappedKey] = val;
    } else {
      mappedRow[trimmedKey] = val;
    }
  }

  return {
    key: mappedRow.key || `US-${String(index + 1).padStart(3, '0')}`,
    summary: mappedRow.summary || "Untitled User Story",
    description: mappedRow.description || "No description provided",
    status: {
      name: mappedRow.status || "To Do",
      category: getStatusCategory(mappedRow.status || "To Do")
    },
    priority: {
      name: mappedRow.priority || "Medium",
      id: getPriorityId(mappedRow.priority || "Medium")
    },
    assignee: mappedRow.assignee ? {
      displayName: typeof mappedRow.assignee === 'string' ? mappedRow.assignee : (mappedRow.assignee?.displayName || String(mappedRow.assignee)),
      emailAddress: null,
      accountId: null
    } : null,
    reporter: mappedRow.reporter ? {
      displayName: typeof mappedRow.reporter === 'string' ? mappedRow.reporter : (mappedRow.reporter?.displayName || String(mappedRow.reporter)),
      emailAddress: null,
      accountId: null
    } : null,
    created: formatExcelDate(mappedRow.created) || new Date().toISOString(),
    updated: formatExcelDate(mappedRow.updated) || new Date().toISOString(),
    components: parseArrayField(mappedRow.components),
    labels: parseArrayField(mappedRow.labels),
    fixVersions: parseArrayField(mappedRow.fixVersions),
    storyPoints: parseFloat(mappedRow.storyPoints) || null,
    project: mappedRow.project || "UNKNOWN",
    epic: mappedRow.epic || null,
    acceptanceCriteria: mappedRow.acceptanceCriteria || "",
    businessValue: mappedRow.businessValue || "",
    risk: mappedRow.risk || "",
    dependencies: mappedRow.dependencies || "",
    notes: mappedRow.notes || "",
    sprint: mappedRow.sprint || null,
    team: mappedRow.team || null,
    issueLinks: [],
    url: "",
    sourceType: "excel",
    importedAt: new Date().toISOString(),
    originalRowIndex: index + 1
  };
}

// Upload and convert Excel to JSON (In-Process, high performance & robust)
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
  let inputFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    inputFile = req.file.path;
    const dataDir = path.join(__dirname, '../src/data');
    const dataType = req.body.dataType || 'testcases';
    const requestedSheet = (req.body.sheetName || (dataType === 'userstories' ? 'stories' : 'testcases')).trim();

    // Ensure output directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${dataDir}`);
    }

    // Output file name based on data type
    const outputFileName = dataType === 'userstories'
      ? `stories-${Date.now()}.json`
      : `converted-${Date.now()}.json`;
    const outputPath = path.join(dataDir, outputFileName);

    if (!fs.existsSync(inputFile)) {
      throw new Error(`Uploaded file could not be found at ${inputFile}`);
    }

    // Read Excel workbook directly in-process
    const workbook = xlsx.readFile(inputFile);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in the uploaded Excel file');
    }

    // Find sheet (exact match -> case-insensitive match -> first sheet)
    let actualSheetName = requestedSheet;
    let worksheet = workbook.Sheets[requestedSheet];

    if (!worksheet) {
      const match = workbook.SheetNames.find(s => s.trim().toLowerCase() === requestedSheet.toLowerCase());
      if (match) {
        actualSheetName = match;
        worksheet = workbook.Sheets[actualSheetName];
      } else {
        actualSheetName = workbook.SheetNames[0];
        worksheet = workbook.Sheets[actualSheetName];
        console.log(`⚠️ Sheet "${requestedSheet}" not found. Using first sheet: "${actualSheetName}"`);
      }
    }

    // Parse sheet rows
    const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
    if (!rawData || rawData.length === 0) {
      throw new Error(`No data rows found in sheet "${actualSheetName}"`);
    }

    let finalData = [];
    let logMessage = '';

    if (dataType === 'userstories') {
      const transformed = rawData.map((row, index) => transformUserStoryRow(row, index));
      finalData = transformed.filter(story =>
        story.summary && story.summary !== 'Untitled User Story' && String(story.summary).trim() !== ''
      );
      logMessage = `✅ Converted ${finalData.length} user stories from "${actualSheetName}" into ${outputFileName}`;
    } else {
      const transformed = rawData.map((row, index) => transformTestCaseRow(row, index));
      // Filter out completely blank rows
      finalData = transformed.filter(tc =>
        (tc.title && String(tc.title).trim() !== '') ||
        (tc.description && String(tc.description).trim() !== '') ||
        (tc.steps && String(tc.steps).trim() !== '') ||
        (tc.module && String(tc.module).trim() !== '')
      );
      // If all were filtered because headers differed, fallback to all transformed rows
      if (finalData.length === 0 && transformed.length > 0) {
        finalData = transformed;
      }
      logMessage = `✅ Converted ${finalData.length} test cases from "${actualSheetName}" into ${outputFileName}`;
    }

    // Write converted JSON file
    fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2), 'utf-8');
    console.log(logMessage);

    // Clean up uploaded Excel temp file
    if (inputFile && fs.existsSync(inputFile)) {
      try {
        fs.unlinkSync(inputFile);
      } catch (err) {}
    }

    const dataTypeLabel = dataType === 'userstories' ? 'User stories' : 'Test cases';
    res.json({
      success: true,
      message: `${dataTypeLabel} file converted successfully`,
      outputFile: outputFileName,
      output: logMessage,
      count: finalData.length
    });

  } catch (error) {
    console.error('❌ Upload error:', error.message);

    // Clean up uploaded file on error
    if (inputFile && fs.existsSync(inputFile)) {
      try {
        fs.unlinkSync(inputFile);
      } catch (err) {}
    }

    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
});

// Create embeddings for selected files (Unified)
app.post('/api/create-embeddings', async (req, res) => {
  try {
    const { files } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files selected' });
    }

    const isUserStories = files.some(f => f.toLowerCase().includes('stor') || f.toLowerCase().includes('story'));
    const scriptName = isUserStories ? 'create-userstories-embeddings-batch-mistral.js' : 'create-embeddings-batch-mistral.js';
    const jobType = isUserStories ? 'user-stories' : 'testcases';
    const targetCollection = isUserStories
      ? (process.env.USER_STORIES_COLLECTION_NAME || 'user_stories')
      : (process.env.COLLECTION_NAME || 'test_cases');

    // Create a job and return immediately
    const jobId = createJob(files);

    // Start processing in background
    processBatchEmbeddings(jobId, files, scriptName, jobType);

    // Return job ID to client
    res.json({
      success: true,
      jobId,
      message: 'Embedding creation started',
      filesCount: files.length,
      jobType
    });

  } catch (error) {
    res.status(500).json({ error: 'Embedding creation failed', details: error.message });
  }
});

// Create embeddings using batch processing scripts (FASTER)
app.post('/api/create-embeddings-batch', async (req, res) => {
  try {
    const { files, scriptName, jobType } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files selected' });
    }

    const selectedScript = scriptName || (
      (jobType === 'user-stories' || files.some(f => f.toLowerCase().includes('stor')))
        ? 'create-userstories-embeddings-batch-mistral.js'
        : 'create-embeddings-batch-mistral.js'
    );

    const actualJobType = jobType || (
      selectedScript.includes('userstories') ? 'user-stories' : 'testcases'
    );

    // Create a job
    const jobId = createJob(files);

    // Start batch processing in background
    processBatchEmbeddings(jobId, files, selectedScript, actualJobType);

    // Return job ID to client
    res.json({
      success: true,
      jobId,
      message: `Batch embedding creation started using ${selectedScript}`,
      filesCount: files.length,
      jobType: actualJobType
    });

  } catch (error) {
    console.error('❌ Batch embedding error:', error);
    res.status(500).json({ error: 'Batch embedding creation failed', details: error.message });
  }
});

// Helper to create comprehensive input text for test case embedding
function createTestCaseInputText(tc) {
  return `
    ID: ${tc.id || ''}
    Module: ${tc.module || ''}
    Title: ${tc.title || ''}
    Description: ${tc.description || ''}
    Steps: ${tc.steps || ''}
    Expected Result: ${tc.expectedResults || tc.expectedResult || ''}
    Priority: ${tc.priority || ''}
    Pre-Requisites: ${tc.preRequisites || ''}
  `.trim();
}

// Helper to create comprehensive input text for user story embedding
function createUserStoryInputText(story) {
  const components = Array.isArray(story.components) ? story.components.join(', ') : (story.components || '');
  const labels = Array.isArray(story.labels) ? story.labels.join(', ') : (story.labels || '');
  const fixVersions = Array.isArray(story.fixVersions) ? story.fixVersions.join(', ') : (story.fixVersions || '');

  return `
    Story Key: ${story.key || story.storyId || ''}
    Summary: ${story.summary || story.title || ''}
    Description: ${story.description || ''}
    Status: ${typeof story.status === 'object' ? (story.status?.name || '') : (story.status || '')}
    Priority: ${typeof story.priority === 'object' ? (story.priority?.name || '') : (story.priority || '')}
    Components: ${components}
    Labels: ${labels}
    Fix Versions: ${fixVersions}
    Acceptance Criteria: ${story.acceptanceCriteria || ''}
    Business Value: ${story.businessValue || ''}
    Dependencies: ${story.dependencies || ''}
    Notes: ${story.notes || ''}
  `.trim();
}

// Direct In-Process Batch Embeddings Processing Function
async function processBatchEmbeddings(jobId, files, scriptName, jobType) {
  const isUserStories = jobType === 'user-stories' || (scriptName && scriptName.includes('userstories')) || files.some(f => f.toLowerCase().includes('stor'));
  const collectionName = isUserStories
    ? (process.env.USER_STORIES_COLLECTION_NAME || 'user_stories')
    : (process.env.COLLECTION_NAME || 'test_cases');

  console.log(`\n🚀 [IN-PROCESS BATCH] Job ${jobId} started for ${files.length} file(s) -> Target Collection: ${collectionName}`);

  const mongoClient = new MongoClient(process.env.MONGODB_URI, {
    ssl: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });

  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(collectionName);

    const results = [];
    let totalItemsProcessed = 0;
    let totalItemsInserted = 0;
    let totalItemsFailed = 0;
    let totalCost = 0;
    let totalTokens = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const fileName = files[fileIndex];
      const filePath = path.isAbsolute(fileName)
        ? fileName
        : path.join(__dirname, '../src/data', path.basename(fileName));

      if (!fs.existsSync(filePath)) {
        console.error(`⚠️ Input file not found: ${filePath}`);
        results.push({ file: fileName, status: 'failed', error: `File not found: ${fileName}` });
        continue;
      }

      console.log(`📂 Processing file (${fileIndex + 1}/${files.length}): ${path.basename(filePath)}`);
      updateJob(jobId, {
        currentFile: path.basename(filePath),
        progress: fileIndex,
        message: `Reading ${path.basename(filePath)}...`
      });

      const raw = fs.readFileSync(filePath, 'utf8');
      let items = [];
      try {
        items = JSON.parse(raw);
      } catch (err) {
        console.error(`❌ JSON parse error in ${fileName}:`, err.message);
        results.push({ file: fileName, status: 'failed', error: `Invalid JSON: ${err.message}` });
        continue;
      }

      if (!Array.isArray(items) || items.length === 0) {
        console.warn(`⚠️ Empty or non-array items in ${fileName}`);
        results.push({ file: fileName, status: 'completed', output: 'Empty file' });
        continue;
      }

      const BATCH_SIZE = 50;
      let fileInserted = 0;
      let fileFailed = 0;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        const inputTexts = chunk.map(item => isUserStories ? createUserStoryInputText(item) : createTestCaseInputText(item));

        try {
          console.log(`🚀 [Batch ${batchNum}/${totalBatches}] Embedding ${chunk.length} items with Mistral AI...`);
          const embRes = await generateBatchEmbeddings(inputTexts);
          const embeddings = embRes.embeddings;
          const tokens = embRes.usage?.total_tokens || 0;
          const cost = (tokens / 1000000) * 0.10;
          totalTokens += tokens;
          totalCost += cost;

          const documents = chunk.map((item, idx) => {
            const { _id, ...cleanItem } = item;
            return {
              ...cleanItem,
              embedding: embeddings[idx],
              createdAt: new Date(),
              sourceFile: path.basename(fileName),
              embeddingMetadata: {
                model: embRes.model || 'mistral-embed',
                provider: embRes.provider || 'mistral',
                createdAt: new Date()
              }
            };
          });

          const insertRes = await collection.insertMany(documents, { ordered: false });
          const insertedCount = insertRes.insertedCount || documents.length;
          fileInserted += insertedCount;
          totalItemsInserted += insertedCount;

          console.log(`✅ [Batch ${batchNum}/${totalBatches}] Inserted ${insertedCount} documents.`);
        } catch (batchErr) {
          console.error(`❌ Batch error in ${fileName} [Batch ${batchNum}/${totalBatches}]:`, batchErr.message);
          fileFailed += chunk.length;
          totalItemsFailed += chunk.length;
        }

        totalItemsProcessed += chunk.length;
        const progressPct = Math.round(((i + chunk.length) / items.length) * 100);
        updateJob(jobId, {
          progress: fileIndex,
          progressPercent: progressPct,
          message: `Progress: ${i + chunk.length}/${items.length} items (${progressPct}%)`
        });

        // Delay between batch calls to stay cleanly within API limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      results.push({
        file: fileName,
        status: fileFailed === 0 ? 'completed' : 'completed_with_errors',
        inserted: fileInserted,
        failed: fileFailed,
        output: `Processed ${items.length} items: ${fileInserted} inserted, ${fileFailed} failed`
      });
    }

    await mongoClient.close();

    console.log(`\n🎉 [IN-PROCESS BATCH COMPLETE] ${totalItemsInserted} items inserted, ${totalItemsFailed} failed, Total Cost: $${totalCost.toFixed(6)}`);

    updateJob(jobId, {
      status: 'completed',
      progress: files.length,
      progressPercent: 100,
      endTime: new Date(),
      results: results,
      totalInserted: totalItemsInserted,
      totalFailed: totalItemsFailed,
      totalCost: totalCost,
      totalTokens: totalTokens,
      message: `Successfully processed ${totalItemsInserted} items across ${files.length} file(s)!`
    });

  } catch (err) {
    console.error(`❌ Fatal In-Process Batch Error:`, err.message);
    try { await mongoClient.close(); } catch (e) {}
    updateJob(jobId, {
      status: 'failed',
      endTime: new Date(),
      error: err.message,
      message: `Failed: ${err.message}`
    });
  }
}

// Background processing function
async function processEmbeddings(jobId, files) {
  const results = [];


  for (const fileName of files) {
    updateJob(jobId, { currentFile: fileName });

    const filePath = path.join(__dirname, '../src/data', fileName);
    // Convert paths to forward slashes for cross-platform compatibility
    const filePathNormalized = filePath.replace(/\\/g, '/');

    // Create a modified version of create-embeddings-store.js for this specific file
    const scriptContent = `
import { MongoClient } from "mongodb";
import dns from "dns";
import dotenv from "dotenv";
import fs from "fs";
import { generateEmbedding } from "../src/scripts/utilities/embeddingService.js";

dotenv.config();

dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  ssl: true,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
});

async function main() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    const testcases = JSON.parse(fs.readFileSync("${filePathNormalized}", "utf-8"));

    console.log(\`🚀 Processing \${testcases.length} test cases from ${fileName}...\`);
    
    let totalCost = 0;
    let totalTokens = 0;
    let processed = 0;

    for (const testcase of testcases) {
      try {
        const inputText = \`
          Module: \${testcase.module}
          ID: \${testcase.id}
          Pre-Requisites: \${testcase.preRequisites}
          Title: \${testcase.title}
          Description: \${testcase.description}
          Steps: \${testcase.steps}
          Expected Result: \${testcase.expectedResults}
          Automation/Manual: \${testcase.automationManual}
          Priority: \${testcase.priority}
          Created By: \${testcase.createdBy}
          Created Date: \${testcase.createdDate}
          Last Modified Date: \${testcase.lastModifiedDate}
          Risk: \${testcase.risk}
          Version: \${testcase.version}
          Type: \${testcase.type}
        \`;
        
        // Use Mistral AI for embeddings
        const embeddingResult = await generateEmbedding(inputText);
        
        if (!embeddingResult || !embeddingResult.embedding) {
          throw new Error('Failed to generate embedding with Mistral AI');
        }

        const vector = embeddingResult.embedding;
        const tokens = embeddingResult.usage?.total_tokens || 0;
        const cost = (tokens / 1000000) * 0.10; // Mistral pricing: $0.10 per 1M tokens
        
        totalCost += cost;
        totalTokens += tokens;

        const doc = {
          ...testcase,
          embedding: vector,
          createdAt: new Date(),
          sourceFile: "${fileName}",
          embeddingMetadata: {
            model: 'mistral-embed',
            provider: 'mistral-ai',
            cost: cost,
            tokens: tokens,
            apiSource: 'testleaf'
          }
        };

        await collection.insertOne(doc);
        processed++;
        
        console.log(\`✅ Processed \${processed}/\${testcases.length}: \${testcase.id}\`);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(\`❌ Error processing \${testcase.id}: \${error.message}\`);
        continue;
      }
    }

    console.log(\`\\n🎉 Processing complete for ${fileName}!\`);
    console.log(\`💰 Total Cost: $\${totalCost.toFixed(6)}\`);
    console.log(\`🔢 Total Tokens: \${totalTokens}\`);
    console.log(\`📊 Processed: \${processed}/\${testcases.length}\`);

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    await mongoClient.close();
  }
}

main();
`;

    const tempScriptPath = path.join(__dirname, `temp-embeddings-${Date.now()}.js`);
    fs.writeFileSync(tempScriptPath, scriptContent);

    try {
      await new Promise((resolve, reject) => {
        const child = spawn('node', [tempScriptPath], { cwd: __dirname });

        let output = '';
        let error = '';

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          error += data.toString();
        });

        child.on('close', (code) => {
          fs.unlinkSync(tempScriptPath);

          if (code === 0) {
            results.push({
              file: fileName,
              status: 'completed',
              output
            });
            resolve();
          } else {
            results.push({
              file: fileName,
              status: 'failed',
              error: error || output
            });
            resolve(); // Continue with other files
          }
        });
      });
    } catch (error) {
      results.push({
        file: fileName,
        status: 'failed',
        error: error.message
      });
    }

    // Update job progress
    updateJob(jobId, {
      progress: results.length,
      results: [...results]
    });
  }

  // Mark job as complete
  updateJob(jobId, {
    status: 'completed',
    endTime: new Date(),
    results
  });
}

// Get environment variables
app.get('/api/env', (req, res) => {
  try {
    const envPath = path.join(__dirname, '../.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const envVars = {};
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && key.trim() && !key.startsWith('#')) {
        envVars[key.trim()] = valueParts.join('=').replace(/"/g, '').trim();
      }
    });

    // Provide default fallbacks if not explicitly defined
    const defaults = {
      LLM_PROVIDER: process.env.LLM_PROVIDER || process.env.GENERATION_PROVIDER || 'groq',
      LLM_MODEL: process.env.LLM_MODEL || process.env.GENERATION_MODEL || 'openai/gpt-oss-120b',
      RERANK_PROVIDER: process.env.RERANK_PROVIDER || 'groq',
      RERANK_MODEL: process.env.RERANK_MODEL || process.env.GROQ_RERANK_MODEL || 'qwen/qwen3.6-27b',
      SUMMARIZATION_PROVIDER: process.env.SUMMARIZATION_PROVIDER || 'groq',
      SUMMARIZATION_MODEL: process.env.SUMMARIZATION_MODEL || process.env.GROQ_SUMMARIZATION_MODEL || 'openai/gpt-oss-120b',
      ENABLE_TOKEN_OPTIMIZATION: process.env.ENABLE_TOKEN_OPTIMIZATION || 'true',
      MAX_TOTAL_TOKENS: process.env.MAX_TOTAL_TOKENS || '8000',
      MAX_GENERATION_TOKENS: process.env.MAX_GENERATION_TOKENS || '3000',
      MAX_SUMMARY_TOKENS: process.env.MAX_SUMMARY_TOKENS || '400',
      ENABLE_FALLBACK: process.env.ENABLE_FALLBACK || 'true',
      FALLBACK_LLM_PROVIDER: process.env.FALLBACK_LLM_PROVIDER || 'mistral',
      FALLBACK_LLM_MODEL: process.env.FALLBACK_LLM_MODEL || 'mistral-small-latest',
      EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'mistral',
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || process.env.MISTRAL_EMBEDDING_MODEL || 'mistral-embed',
      GROQ_API_KEY: process.env.GROQ_API_KEY || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
      MONGODB_URI: process.env.MONGODB_URI || '',
      DB_NAME: process.env.DB_NAME || 'db_stories_tests',
      COLLECTION_NAME: process.env.COLLECTION_NAME || 'test_cases',
      TESTCASES_COLLECTION_NAME: process.env.TESTCASES_COLLECTION_NAME || 'testcases',
      VECTOR_INDEX_NAME: process.env.VECTOR_INDEX_NAME || 'vector_index_test_cases',
      BM25_INDEX_NAME: process.env.BM25_INDEX_NAME || 'bm25_search',
      USER_STORIES_COLLECTION_NAME: process.env.USER_STORIES_COLLECTION_NAME || 'user_stories',
      USER_STORIES_VECTOR_INDEX_NAME: process.env.USER_STORIES_VECTOR_INDEX_NAME || 'vector_index_user_story',
      USER_STORIES_BM25_INDEX_NAME: process.env.USER_STORIES_BM25_INDEX_NAME || 'bm25_user_stories',
      PORT: process.env.PORT || '3001',
      DEEPEVAL_PORT: process.env.DEEPEVAL_PORT || '8000',
      DEEPEVAL_URL: process.env.DEEPEVAL_URL || 'http://localhost:8000/eval',
      EVAL_MODEL: process.env.EVAL_MODEL || 'openai/gpt-oss-120b',
      ENABLED_METRICS: process.env.ENABLED_METRICS || 'faithfulness,contextual_precision,contextual_recall,pii_leakage,bias,hallucination,ragas,answer_relevancy',
      JIRA_BASE_URL: process.env.JIRA_BASE_URL || '',
      JIRA_EMAIL: process.env.JIRA_EMAIL || '',
      JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY || '',
      JIRA_ISSUE_TYPE: process.env.JIRA_ISSUE_TYPE || 'Task'
    };

    const merged = { ...defaults, ...envVars };
    delete merged.JIRA_API_TOKEN;
    res.json(merged);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read environment variables', details: error.message });
  }
});

// Helper to format .env file with organized sections and comments
function formatEnvFileContent(env) {
  const knownKeys = new Set([
    'MONGODB_URI', 'DB_NAME', 'COLLECTION_NAME', 'TESTCASES_COLLECTION_NAME', 'VECTOR_INDEX_NAME', 'BM25_INDEX_NAME',
    'USER_STORIES_COLLECTION_NAME', 'USER_STORIES_VECTOR_INDEX_NAME', 'USER_STORIES_BM25_INDEX_NAME',
    'LLM_PROVIDER', 'LLM_MODEL', 'RERANK_PROVIDER', 'RERANK_MODEL', 'SUMMARIZATION_PROVIDER', 'SUMMARIZATION_MODEL',
    'ENABLE_TOKEN_OPTIMIZATION', 'MAX_TOTAL_TOKENS', 'MAX_GENERATION_TOKENS', 'MAX_SUMMARY_TOKENS',
    'ENABLE_FALLBACK', 'FALLBACK_LLM_PROVIDER', 'FALLBACK_LLM_MODEL',
    'EMBEDDING_PROVIDER', 'EMBEDDING_MODEL',
    'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MISTRAL_API_KEY',
    'PORT', 'DEEPEVAL_PORT', 'DEEPEVAL_URL', 'EVAL_MODEL', 'ENABLED_METRICS',
    'JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY', 'JIRA_ISSUE_TYPE'
  ]);

  let content = `# ======================== MongoDB Database & Collections ========================
# MongoDB Atlas Connection URI with credentials
MONGODB_URI="${env.MONGODB_URI || ''}"
# Database Name
DB_NAME="${env.DB_NAME || 'db_stories_tests'}"

# Test Cases Collection & Search Indexes
COLLECTION_NAME="${env.COLLECTION_NAME || 'test_cases'}"
TESTCASES_COLLECTION_NAME="${env.TESTCASES_COLLECTION_NAME || 'testcases'}"
VECTOR_INDEX_NAME="${env.VECTOR_INDEX_NAME || 'vector_index_test_cases'}"
BM25_INDEX_NAME="${env.BM25_INDEX_NAME || 'bm25_search'}"

# User Stories Collection & Search Indexes
USER_STORIES_COLLECTION_NAME="${env.USER_STORIES_COLLECTION_NAME || 'user_stories'}"
USER_STORIES_VECTOR_INDEX_NAME="${env.USER_STORIES_VECTOR_INDEX_NAME || 'vector_index_user_story'}"
USER_STORIES_BM25_INDEX_NAME="${env.USER_STORIES_BM25_INDEX_NAME || 'bm25_user_stories'}"

# ======================== Task-Specific LLM Models ========================
# 1. Primary Test Case Generation / QA LLM (groq | gemini | openai | claude | mistral)
LLM_PROVIDER="${env.LLM_PROVIDER || 'groq'}"
LLM_MODEL="${env.LLM_MODEL || 'openai/gpt-oss-120b'}"

# 2. Semantic Reranking LLM (groq | gemini | openai | claude | mistral)
RERANK_PROVIDER="${env.RERANK_PROVIDER || 'groq'}"
RERANK_MODEL="${env.RERANK_MODEL || 'qwen/qwen3.6-27b'}"

# 3. Summarization & Deduplication LLM (groq | gemini | openai | claude | mistral)
SUMMARIZATION_PROVIDER="${env.SUMMARIZATION_PROVIDER || 'groq'}"
SUMMARIZATION_MODEL="${env.SUMMARIZATION_MODEL || 'openai/gpt-oss-120b'}"

# ======================== Token Optimization & 8k Budget Control ========================
# Enable token budgeting to strictly stay under 8,000 tokens for free-tier Groq/Gemini models
ENABLE_TOKEN_OPTIMIZATION="${env.ENABLE_TOKEN_OPTIMIZATION || 'true'}"
MAX_TOTAL_TOKENS="${env.MAX_TOTAL_TOKENS || '8000'}"
MAX_GENERATION_TOKENS="${env.MAX_GENERATION_TOKENS || '3000'}"
MAX_SUMMARY_TOKENS="${env.MAX_SUMMARY_TOKENS || '400'}"

# ======================== Automatic Fallback Mechanism ========================
# Enable automatic failover on rate limits (HTTP 429, 8k token caps) or server outages
ENABLE_FALLBACK="${env.ENABLE_FALLBACK || 'true'}"
FALLBACK_LLM_PROVIDER="${env.FALLBACK_LLM_PROVIDER || 'mistral'}"
FALLBACK_LLM_MODEL="${env.FALLBACK_LLM_MODEL || 'mistral-small-latest'}"

# ======================== Vector Embeddings Configuration ========================
# Supported Embedding Providers: mistral (1024 dims) | openai (1536 dims) | gemini (768 dims)
EMBEDDING_PROVIDER="${env.EMBEDDING_PROVIDER || 'mistral'}"
EMBEDDING_MODEL="${env.EMBEDDING_MODEL || 'mistral-embed'}"

# ======================== Jira Test Case Publishing ========================
JIRA_BASE_URL="${env.JIRA_BASE_URL || ''}"
JIRA_EMAIL="${env.JIRA_EMAIL || ''}"
JIRA_API_TOKEN="${process.env.JIRA_API_TOKEN || env.JIRA_API_TOKEN || ''}"
JIRA_PROJECT_KEY="${env.JIRA_PROJECT_KEY || ''}"
JIRA_ISSUE_TYPE="${env.JIRA_ISSUE_TYPE || 'Task'}"

# ======================== API Keys Vault ========================
GROQ_API_KEY="${env.GROQ_API_KEY || ''}"
GEMINI_API_KEY="${env.GEMINI_API_KEY || ''}"
OPENAI_API_KEY="${env.OPENAI_API_KEY || ''}"
ANTHROPIC_API_KEY="${env.ANTHROPIC_API_KEY || ''}"
MISTRAL_API_KEY="${env.MISTRAL_API_KEY || ''}"

# ======================== Server & DeepEval LLM Evaluation Configuration ========================
PORT=${env.PORT || '3001'}
DEEPEVAL_PORT=${env.DEEPEVAL_PORT || '8000'}
DEEPEVAL_URL="${env.DEEPEVAL_URL || 'http://localhost:8000/eval'}"
EVAL_MODEL="${env.EVAL_MODEL || 'openai/gpt-oss-120b'}"
ENABLED_METRICS="${env.ENABLED_METRICS || 'faithfulness,contextual_precision,contextual_recall,pii_leakage,bias,hallucination,ragas,answer_relevancy'}"
`;

  // Append any custom additional keys not in the standard set
  const extraKeys = Object.entries(env).filter(([k]) => !knownKeys.has(k) && !k.startsWith('#'));
  if (extraKeys.length > 0) {
    content += `\n# ======================== Custom Configuration ========================\n`;
    extraKeys.forEach(([k, v]) => {
      content += `${k}="${v}"\n`;
    });
  }

  return content;
}

// DeepEval Evaluation Proxy Endpoint
app.post('/api/eval', async (req, res) => {
  try {
    const deepevalUrl = process.env.DEEPEVAL_URL || 'http://localhost:8000/eval';
    console.log(`📡 Proxying evaluation request to ${deepevalUrl}...`);
    const response = await axios.post(deepevalUrl, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 180000 // 3 minutes timeout for DeepEval LLM evaluation
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ DeepEval proxy error:', error.message);
    const status = error.response ? error.response.status : 502;
    const data = error.response ? error.response.data : {
      error: 'DeepEval service unreachable',
      message: `${error.message}. Ensure the DeepEval server is running on http://localhost:8000`
    };
    res.status(status).json(data);
  }
});

app.post('/api/testcases/publish', async (req, res) => {
  const { testCases, mode, approved, qualityResults, userStory, generationMode } = req.body || {};
  if (!Array.isArray(testCases) || testCases.length === 0) {
    return res.status(400).json({ error: 'At least one generated test case is required.' });
  }
  if (!['manual', 'automation'].includes(mode)) {
    return res.status(400).json({ error: 'Publish mode must be manual or automation.' });
  }
  if (mode === 'manual' && approved !== true) {
    return res.status(403).json({ error: 'Manual publishing requires explicit approval.' });
  }
  if (mode === 'automation') {
    const failures = [];
    for (const testCase of testCases) {
      const id = testCase.testCaseId || testCase.id || testCase.testCaseTitle || 'Unknown test case';
      const evaluated = (qualityResults || []).find(result => result.testCaseId === id);
      const metrics = Object.fromEntries((evaluated?.results || []).map(metric => [
        String(metric.metric_name || '').toLowerCase().replace(/[\s-]+/g, '_'),
        metric.score
      ]));
      if (typeof metrics.faithfulness !== 'number' || metrics.faithfulness < 0.75) {
        failures.push(`${id}: Faithfulness must be at least 0.75.`);
      }
      if (typeof metrics.hallucination !== 'number' || metrics.hallucination > 0.25) {
        failures.push(`${id}: Hallucination must be at most 0.25.`);
      }
    }
    if (failures.length) {
      return res.status(422).json({ error: 'Quality validation failed; nothing was published.', failures });
    }
  }

  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;
  const jiraProjectKey = process.env.JIRA_PROJECT_KEY;
  if (!process.env.MONGODB_URI || !process.env.DB_NAME) {
    return res.status(503).json({ error: 'MongoDB connection settings are not configured.' });
  }
  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken || !jiraProjectKey) {
    return res.status(503).json({ error: 'Jira settings are incomplete. Configure JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY on the server.' });
  }

  const jira = axios.create({
    baseURL: `${jiraBaseUrl.replace(/\/$/, '')}/rest/api/3`,
    auth: { username: jiraEmail, password: jiraApiToken },
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 30000
  });
  const createdIssues = [];
  let mongoClient;
  try {
    const requestedIssueType = process.env.JIRA_ISSUE_TYPE || 'Task';
    const issueTypesResponse = await jira.get(`/issue/createmeta/${encodeURIComponent(jiraProjectKey)}/issuetypes`);
    const availableIssueTypes = issueTypesResponse.data.values || issueTypesResponse.data.issueTypes || [];
    const issueType = availableIssueTypes.find(type =>
      type.name.toLowerCase() === requestedIssueType.toLowerCase()
    );
    if (!issueType) {
      return res.status(400).json({
        error: `Jira issue type '${requestedIssueType}' is unavailable for project '${jiraProjectKey}'.`,
        details: `Available issue types: ${availableIssueTypes.map(type => type.name).join(', ') || 'none'}.`
      });
    }

    for (const testCase of testCases) {
      const summary = String(testCase.testCaseTitle || testCase.title || testCase.testCaseId || 'Generated test case').slice(0, 250);
      const description = [
        `Test Case ID: ${testCase.testCaseId || testCase.id || 'N/A'}`,
        `Description: ${testCase.testCaseDescription || testCase.description || 'N/A'}`,
        `Preconditions: ${testCase.preconditions || 'N/A'}`,
        `Steps:\n${testCase.testSteps || testCase.steps || 'N/A'}`,
        `Expected Results: ${testCase.expectedResults || testCase.expectedResult || 'N/A'}`,
        `Priority: ${testCase.priority || 'N/A'}`,
        `User Story: ${userStory || 'N/A'}`
      ].join('\n\n').slice(0, 30000);
      const issueResponse = await jira.post('/issue', {
        fields: {
          project: { key: jiraProjectKey },
          summary,
          issuetype: { id: issueType.id },
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
          },
          labels: ['ai-generated-testcase']
        }
      });
      createdIssues.push({ key: issueResponse.data.key, id: testCase.testCaseId || testCase.id || summary });
    }

    mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const collectionName = process.env.TESTCASES_COLLECTION_NAME || 'testcases';
    const collection = mongoClient.db(process.env.DB_NAME).collection(collectionName);
    const publishedAt = new Date().toISOString();
    const documents = testCases.map((testCase, index) => ({
      ...testCase,
      jiraKey: createdIssues[index].key,
      source: 'deepeval-approved-generation',
      generationMode: generationMode || 'unknown',
      qualityMode: mode,
      qualityResults: (qualityResults || []).find(result => result.testCaseId === createdIssues[index].id) || null,
      userStory: userStory || '',
      publishedAt
    }));
    await collection.insertMany(documents);
    return res.json({
      success: true,
      collection: collectionName,
      publishedAt,
      published: documents.length,
      jiraIssues: createdIssues
    });
  } catch (error) {
    await Promise.all(createdIssues.map(issue => jira.delete(`/issue/${issue.key}`).catch(() => null)));
    console.error('Test case publication failed:', error.response?.data || error.message);
    const jiraData = error.response?.data;
    const fieldErrors = Object.entries(jiraData?.errors || {}).map(([field, message]) => `${field}: ${message}`);
    const jiraMessages = [...(jiraData?.errorMessages || []), ...fieldErrors].filter(Boolean);
    return res.status(502).json({
      error: 'Publishing failed. Any Jira issues created during this request were removed where possible.',
      details: jiraMessages.join('; ') || jiraData?.message || error.message,
      upstreamStatus: error.response?.status || null
    });
  } finally {
    if (mongoClient) await mongoClient.close().catch(() => {});
  }
});

// DeepEval Health Proxy
app.get('/api/eval/health', async (req, res) => {
  try {
    const deepevalBase = (process.env.DEEPEVAL_URL || 'http://localhost:8000/eval').replace(/\/eval\/?$/, '');
    const healthUrl = `${deepevalBase}/health`;
    const response = await axios.get(healthUrl, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    res.status(503).json({
      status: 'offline',
      service: 'Deepeval Evaluation Service',
      message: 'DeepEval server is not currently reachable'
    });
  }
});

// Update environment variables
app.post('/api/env', (req, res) => {
  try {
    const envVars = (req.body && req.body.envVars) ? req.body.envVars : req.body;
    const envPath = path.join(__dirname, '../.env');

    if (!envVars || typeof envVars !== 'object' || Object.keys(envVars).length === 0) {
      return res.status(400).json({ error: 'envVars object is required' });
    }

    // Synchronize in-memory environment variables immediately
    Object.entries(envVars).forEach(([key, value]) => {
      const cleanVal = String(value !== undefined && value !== null ? value : '');
      process.env[key] = cleanVal;
    });

    const envContent = formatEnvFileContent(envVars);
    fs.writeFileSync(envPath, envContent, 'utf-8');

    console.log('✅ Environment variables formatted and saved with comments to .env');
    res.json({ success: true, message: 'Environment variables updated and applied successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update environment variables', details: error.message });
  }
});

// Get LLM & Embedding provider information and options
app.get('/api/llm/providers', (req, res) => {
  try {
    res.json({
      success: true,
      llmProviders: PROVIDER_PRESETS,
      embeddingProviders: EMBEDDING_PRESETS,
      activeConfig: {
        llm: getLLMConfig(),
        embedding: getEmbeddingConfig()
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch provider presets', details: error.message });
  }
});

// Test LLM Connection
app.post('/api/llm/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    const result = await testLLMConnection({ provider, apiKey, model, baseUrl });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test Embedding Connection
app.post('/api/embedding/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    const result = await testEmbeddingConnection({ provider, apiKey, model, baseUrl });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================== Query Preprocessing ========================
// Preprocess query: normalization, abbreviation expansion, synonym expansion
app.post('/api/search/preprocess', async (req, res) => {
  try {
    const { query, options = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Import preprocessing modules dynamically
    const { preprocessQuery } = await import('../src/scripts/query-preprocessing/queryPreprocessor.js');

    // Preprocess the query
    const result = preprocessQuery(query, {
      enableAbbreviations: options.enableAbbreviations !== false,
      enableSynonyms: options.enableSynonyms !== false,
      maxSynonymVariations: options.maxSynonymVariations || 5,
      customAbbreviations: options.customAbbreviations || {},
      customSynonyms: options.customSynonyms || {},
      smartExpansion: options.smartExpansion || false,
      preserveTestCaseIds: options.preserveTestCaseIds !== false
    });

    res.json(result);
  } catch (error) {
    console.error('Preprocessing error:', error);
    res.status(500).json({
      error: 'Failed to preprocess query',
      details: error.message
    });
  }
});

// Analyze query (show what preprocessing would do without applying)
app.post('/api/search/analyze', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const { analyzeQuery } = await import('../src/scripts/query-preprocessing/queryPreprocessor.js');
    const analysis = analyzeQuery(query);

    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze query',
      details: error.message
    });
  }
});

// ======================== Summarization & Deduplication Helpers ========================

// Extract normalized document fields across multiple schema conventions
function getDocumentFields(doc) {
  if (!doc || typeof doc !== 'object') {
    return { id: '', title: '', description: '', steps: '', expectedResults: '', fullText: '', embedding: null };
  }
  const id = doc.id || doc.testCaseId || doc.userStoryId || doc.storyId || doc.key || doc.tcId || (doc._id ? doc._id.toString() : '');
  const title = (doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || doc.story_title || doc.storyTitle || doc.summary || '').trim();
  const description = (doc.description || doc.testCaseDescription || doc.userStoryDescription || doc.storyDescription || doc.acceptanceCriteria || doc.details || '').trim();
  const steps = (Array.isArray(doc.steps) ? doc.steps.join(' ') : (doc.steps || doc.testSteps || doc.test_steps || '')).trim();
  const expectedResults = (doc.expectedResults || doc.expected_results || '').trim();
  const fullText = [title, description, steps, expectedResults].filter(Boolean).join(' ');
  const embedding = Array.isArray(doc.embedding) && doc.embedding.length > 0 ? doc.embedding : null;
  return { id, title, description, steps, expectedResults, fullText, embedding };
}

// Cosine similarity for embedding vectors
function calculateCosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || !vec1.length || !vec2.length || vec1.length !== vec2.length) return null;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))));
}

// Common stop words for cleaner keyword matching
const DEDUP_STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'via', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'of', 'into']);

// Clean and normalize text
function normalizeCleanText(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Get word tokens set with optional stop-word filter
function getTextTokens(text, filterStopWords = false) {
  const norm = normalizeCleanText(text);
  if (!norm) return new Set();
  const words = norm.split(' ').filter(w => w.length > 0);
  if (filterStopWords) {
    const filtered = words.filter(w => !DEDUP_STOP_WORDS.has(w));
    if (filtered.length > 0) return new Set(filtered);
  }
  return new Set(words);
}

// Get character N-grams set for morphological / typo tolerance
function getCharacterNgrams(text, n = 3) {
  const norm = normalizeCleanText(text);
  if (!norm || norm.length < n) return new Set(norm ? [norm] : []);
  const ngrams = new Set();
  for (let i = 0; i <= norm.length - n; i++) {
    ngrams.add(norm.slice(i, i + n));
  }
  return ngrams;
}

// Compute set overlap similarity (combining Dice & Jaccard)
function computeSetOverlapSimilarity(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }
  if (intersectionSize === 0) return 0;
  const dice = (2 * intersectionSize) / (setA.size + setB.size);
  const jaccard = intersectionSize / (setA.size + setB.size - intersectionSize);
  return (dice + jaccard) / 2;
}

// Compute pure Dice similarity
function computeSetDiceSimilarity(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }
  if (intersectionSize === 0) return 0;
  return (2 * intersectionSize) / (setA.size + setB.size);
}

// Helper function to calculate text similarity between two strings
function calculateTextSimilarity(text1, text2) {
  const norm1 = normalizeCleanText(text1);
  const norm2 = normalizeCleanText(text2);
  if (!norm1 && !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0;

  // 1. Raw word token similarity
  const tokens1 = getTextTokens(norm1, false);
  const tokens2 = getTextTokens(norm2, false);
  const rawTokenSim = computeSetDiceSimilarity(tokens1, tokens2);

  // 2. Content token similarity (excluding noise stop words)
  const contentTokens1 = getTextTokens(norm1, true);
  const contentTokens2 = getTextTokens(norm2, true);
  const contentTokenSim = computeSetDiceSimilarity(contentTokens1, contentTokens2);

  // 3. Character 3-gram similarity
  const ngrams1 = getCharacterNgrams(norm1, 3);
  const ngrams2 = getCharacterNgrams(norm2, 3);
  const ngramSim = computeSetDiceSimilarity(ngrams1, ngrams2);

  // 4. Substring containment match
  let containment = 0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const minLen = Math.min(norm1.length, norm2.length);
    const maxLen = Math.max(norm1.length, norm2.length);
    containment = minLen / maxLen;
  }

  return Math.max(rawTokenSim, contentTokenSim, ngramSim, containment);
}

// Calculate comprehensive similarity between two documents
function calculateDocumentSimilarity(docA, docB) {
  const fieldsA = getDocumentFields(docA);
  const fieldsB = getDocumentFields(docB);

  // 1. Vector cosine similarity if embeddings are present on both
  if (fieldsA.embedding && fieldsB.embedding) {
    const cosine = calculateCosineSimilarity(fieldsA.embedding, fieldsB.embedding);
    if (cosine !== null) return cosine;
  }

  // 2. Exact Title Match
  const normTitleA = normalizeCleanText(fieldsA.title);
  const normTitleB = normalizeCleanText(fieldsB.title);
  if (normTitleA && normTitleB && normTitleA === normTitleB) {
    return 1.0;
  }

  // 3. Title similarity
  const titleSim = (normTitleA && normTitleB) ? calculateTextSimilarity(fieldsA.title, fieldsB.title) : 0;

  // 4. Description & Steps similarity
  const normDescA = normalizeCleanText(fieldsA.description || fieldsA.steps);
  const normDescB = normalizeCleanText(fieldsB.description || fieldsB.steps);
  const descSim = (normDescA && normDescB) ? calculateTextSimilarity(normDescA, normDescB) : 0;

  // 5. Full text similarity
  const fullSim = calculateTextSimilarity(fieldsA.fullText, fieldsB.fullText);

  // If title is highly similar (>= 0.85), title similarity strongly indicates duplication
  if (titleSim >= 0.85) {
    return Math.max(titleSim, fullSim);
  }

  // If titles and descriptions both have moderate similarity, weight them
  if (titleSim > 0 && descSim > 0) {
    return Math.max(fullSim, (0.65 * titleSim + 0.35 * descSim));
  }

  return Math.max(titleSim, fullSim);
}

// Deduplicate results based on similarity (supports 0.85 or 85 thresholds)
app.post('/api/search/deduplicate', async (req, res) => {
  try {
    const { results, threshold = 0.85 } = req.body;

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    if (results.length === 0) {
      return res.json({
        original: [],
        deduplicated: [],
        duplicates: [],
        stats: {
          originalCount: 0,
          deduplicatedCount: 0,
          duplicatesRemoved: 0,
          reductionPercentage: '0.0',
          threshold: 0.85,
          thresholdPercentage: '85%'
        }
      });
    }

    // Normalize threshold: handles both decimal (0.85, 0.90) and percentage (85, 90)
    let parsedThreshold = parseFloat(threshold);
    if (isNaN(parsedThreshold) || parsedThreshold < 0) {
      parsedThreshold = 0.85;
    }
    const effectiveThreshold = parsedThreshold > 1 ? parsedThreshold / 100 : parsedThreshold;
    const boundedThreshold = Math.min(1.0, Math.max(0.0, effectiveThreshold));

    console.log(`🧹 Deduplicating ${results.length} items with threshold ${boundedThreshold} (raw input: ${threshold})`);

    const deduplicated = [];
    const duplicates = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      let isDuplicate = false;
      let maxSim = 0;
      let matchedMaster = null;

      for (let j = 0; j < deduplicated.length; j++) {
        const master = deduplicated[j];
        const sim = calculateDocumentSimilarity(result, master);

        if (sim >= boundedThreshold && sim > maxSim) {
          maxSim = sim;
          matchedMaster = master;
          isDuplicate = true;
        }
      }

      if (isDuplicate && matchedMaster) {
        const masterFields = getDocumentFields(matchedMaster);
        const resultFields = getDocumentFields(result);
        duplicates.push({
          ...result,
          id: resultFields.id || result.id || `item-${i + 1}`,
          title: resultFields.title || result.title || 'Untitled',
          description: resultFields.description || result.description || '',
          duplicateOf: masterFields.id || 'Master Item',
          duplicateOfTitle: masterFields.title || '',
          similarity: parseFloat(maxSim.toFixed(3)),
          similarityPercentage: `${(maxSim * 100).toFixed(1)}%`
        });
      } else {
        deduplicated.push(result);
      }
    }

    res.json({
      success: true,
      original: results,
      deduplicated,
      duplicates,
      stats: {
        originalCount: results.length,
        deduplicatedCount: deduplicated.length,
        duplicatesRemoved: duplicates.length,
        reductionPercentage: results.length > 0 ? ((duplicates.length / results.length) * 100).toFixed(1) : '0.0',
        threshold: boundedThreshold,
        thresholdPercentage: `${(boundedThreshold * 100).toFixed(0)}%`
      }
    });
  } catch (error) {
    console.error('Deduplication error:', error);
    res.status(500).json({
      error: 'Failed to deduplicate results',
      details: error.message
    });
  }
});

// Summarize search results using Multi-LLM with automatic Fallback
app.post('/api/search/summarize', async (req, res) => {
  try {
    const { results, summaryType = 'concise', query = '' } = req.body;

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    if (results.length === 0) {
      return res.json({
        success: true,
        summary: 'No results to summarize',
        summaryType,
        resultCount: 0,
        timestamp: new Date().toISOString()
      });
    }

    const searchQuery = query || 'test cases';

    const maxSummaryTokens = req.body.maxTokens || (process.env.MAX_SUMMARY_TOKENS ? parseInt(process.env.MAX_SUMMARY_TOKENS, 10) : 400);

    const summary = await summarizeResults(searchQuery, results, {
      style: summaryType === 'detailed' ? 'detailed' : 'concise',
      maxLength: summaryType === 'detailed' ? 1000 : 300,
      maxTokens: maxSummaryTokens,
      includeMetrics: summaryType === 'detailed',
      provider: req.body.provider,
      model: req.body.model
    });

    console.log('✅ Summarization complete');

    const promptTokens = Math.ceil(JSON.stringify(results).length / 4);
    const completionTokens = Math.ceil((summary || '').length / 4);
    const totalTokens = promptTokens + completionTokens;

    res.json({
      success: true,
      summary: summary,
      summaryType,
      resultCount: results.length,
      model: req.body.model || process.env.SUMMARIZATION_MODEL || process.env.LLM_MODEL || 'multi-llm',
      provider: req.body.provider || process.env.SUMMARIZATION_PROVIDER || process.env.LLM_PROVIDER || 'groq',
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens
      },
      budget: {
        maxTotal: parseInt(process.env.MAX_TOTAL_TOKENS || '8000', 10),
        maxSummary: maxSummaryTokens,
        optimizationActive: process.env.ENABLE_TOKEN_OPTIMIZATION !== 'false',
        totalUsed: totalTokens
      },
      cost: {
        input: '0.000000',
        output: '0.000000',
        total: '0.000000'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({
      error: 'Summarization failed',
      details: error.message
    });
  }
});

// ======================== Multi-LLM Test Prompt Endpoint with Fallback ========================
app.post('/api/test-prompt', async (req, res) => {
  try {
    const { prompt, messages, systemPrompt, temperature = 0.2, maxTokens = 3000, provider, model } = req.body;

    if (!prompt && (!messages || messages.length === 0)) {
      return res.status(400).json({ error: 'Prompt or messages is required' });
    }

    console.log('🤖 Running LLM prompt generation...');

    const result = await chatCompletion({
      prompt,
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      provider,
      model
    });

    const aiResponse = result.content || '';
    const usage = result.usage || {};
    const config = getLLMConfig();

    console.log(`✅ LLM response received from [${result.provider}] model [${result.model}] ${result.fallbackUsed ? '(FALLBACK ACTIVATED)' : ''}`);

    // Parse and auto-repair JSON response with robust fallbacks
    const parsedResponse = parseAndRepairLlmOutput(aiResponse);

    const totalToks = usage.totalTokens || ((usage.promptTokens || 0) + (usage.completionTokens || 0));
    const budgetCap = config.maxTotalTokens || 8000;

    return res.json({
      success: true,
      response: parsedResponse,
      rawContent: aiResponse,
      moderation: result.moderation,
      model: result.model,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed || false,
      primaryError: result.primaryError || null,
      primaryProvider: result.primaryProvider || null,
      primaryModel: result.primaryModel || null,
      tokens: {
        prompt: usage.promptTokens || 0,
        completion: usage.completionTokens || 0,
        total: totalToks
      },
      budget: {
        maxTotal: budgetCap,
        maxGeneration: config.maxGenerationTokens || 3000,
        optimizationActive: config.enableTokenOptimization,
        remainingBudget: Math.max(0, budgetCap - totalToks),
        isSafe: totalToks <= budgetCap
      },
      cost: {
        input: (((usage.promptTokens || 0) / 1000000) * 0.05).toFixed(6),
        output: (((usage.completionTokens || 0) / 1000000) * 0.10).toFixed(6),
        total: ((totalToks / 1000000) * 0.08).toFixed(6)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === 'MODERATION_UNAVAILABLE') {
      return res.status(503).json({ error: 'Moderation service unavailable; LLM request was not completed' });
    }
    if (error.code === 'MODERATION_BLOCKED') {
      return res.status(error.stage === 'input' ? 422 : 502).json({
        error: error.message,
        stage: error.stage,
        decision: error.decision
      });
    }
    console.error('Prompt test error:', error);
    return res.status(500).json({
      error: 'Failed to test prompt',
      details: error.message
    });
  }
});



// Groq-only reranking (skip score fusion, use LLM for ranking)
async function handleGroqOnlyReranking(req, res, query, limit, filters) {
  const startTime = Date.now();

  try {
    console.log(`\n🤖 GROQ-ONLY RERANKING MODE`);
    console.log(`   Query: "${query}"`);
    console.log(`   Limit: ${limit}`);
    console.log(`   Filters: ${JSON.stringify(filters)}`);

    // 1. Hybrid Search (get candidates)
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await mongoClient.connect();

    // Validate indexes
    const bm25Validation = await validateDbCollectionIndex(
      mongoClient,
      process.env.DB_NAME,
      process.env.COLLECTION_NAME,
      process.env.BM25_INDEX_NAME,
      true
    );

    const vectorValidation = await validateDbCollectionIndex(
      mongoClient,
      process.env.DB_NAME,
      process.env.COLLECTION_NAME,
      process.env.VECTOR_INDEX_NAME,
      true
    );

    if (!bm25Validation.ok || !vectorValidation.ok) {
      await mongoClient.close();
      return res.status(400).json({
        error: 'Search indexes not available',
        details: bm25Validation.error || vectorValidation.error
      });
    }

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // 2. Get candidates from both BM25 and Vector (50 results)
    console.log(`📊 Fetching candidates from BM25 and Vector search...`);
    const candidateLimit = 50;

    // BM25 search
    const bm25Pipeline = [
      {
        $search: {
          index: process.env.BM25_INDEX_NAME,
          text: {
            query: query,
            path: ['id', 'title', 'description', 'steps', 'expectedResults', 'module']
          }
        }
      },
      { $addFields: { bm25Score: { $meta: "searchScore" } } }
    ];

    // Apply filters to BM25 search
    if (Object.keys(filters).length > 0) {
      const matchConditions = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          matchConditions[key] = value;
        }
      });
      if (Object.keys(matchConditions).length > 0) {
        bm25Pipeline.push({ $match: matchConditions });
      }
    }

    bm25Pipeline.push(
      { $project: { _id: 1, id: 1, title: 1, description: 1, module: 1, priority: 1, risk: 1, steps: 1, expectedResults: 1, bm25Score: 1 } },
      { $limit: candidateLimit }
    );

    // Vector search
    const embeddingResult = await generateEmbedding(query);
    if (!embeddingResult || !embeddingResult.embedding) {
      throw new Error('Failed to generate embedding');
    }

    const vectorPipeline = [
      {
        $vectorSearch: {
          queryVector: embeddingResult.embedding,
          path: "embedding",
          numCandidates: 100,
          limit: candidateLimit,
          index: process.env.VECTOR_INDEX_NAME
        }
      },
      { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } }
    ];

    // Apply filters to Vector search
    if (Object.keys(filters).length > 0) {
      const matchConditions = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          matchConditions[key] = value;
        }
      });
      if (Object.keys(matchConditions).length > 0) {
        vectorPipeline.push({ $match: matchConditions });
      }
    }

    vectorPipeline.push(
      { $project: { _id: 1, id: 1, title: 1, description: 1, module: 1, priority: 1, risk: 1, steps: 1, expectedResults: 1, vectorScore: 1 } }
    );

    // Get candidates from both
    const [bm25Results, vectorResults] = await Promise.all([
      collection.aggregate(bm25Pipeline).toArray(),
      collection.aggregate(vectorPipeline).toArray()
    ]);

    // Merge results (accurately combine both BM25 and Vector scores)
    let maxBm25 = 1;
    bm25Results.forEach(d => {
      if (d.bm25Score && d.bm25Score > maxBm25) maxBm25 = d.bm25Score;
    });

    const candidateMap = new Map();

    // 1. Add BM25 results
    bm25Results.forEach((doc, rankIdx) => {
      const normBm25 = maxBm25 > 0 ? parseFloat((doc.bm25Score / maxBm25).toFixed(4)) : 0;
      candidateMap.set(doc.id, {
        ...doc,
        bm25Score: doc.bm25Score || 0,
        normalizedBm25Score: normBm25,
        vectorScore: 0,
        bm25Rank: rankIdx + 1,
        vectorRank: 999
      });
    });

    // 2. Merge Vector results (updating vectorScore if document already present, or adding if new)
    vectorResults.forEach((doc, rankIdx) => {
      const existing = candidateMap.get(doc.id);
      const vScore = typeof doc.vectorScore === 'number' ? parseFloat(doc.vectorScore.toFixed(4)) : 0;
      if (existing) {
        existing.vectorScore = vScore;
        existing.vectorRank = rankIdx + 1;
      } else {
        candidateMap.set(doc.id, {
          ...doc,
          bm25Score: 0,
          normalizedBm25Score: 0,
          vectorScore: vScore,
          bm25Rank: 999,
          vectorRank: rankIdx + 1
        });
      }
    });

    // 3. Score Fusion: Calculate balanced Hybrid Score combining vector + keyword similarity
    const candidates = Array.from(candidateMap.values()).map(doc => {
      const vScore = doc.vectorScore || 0;
      const bScore = doc.normalizedBm25Score || 0;
      // Reciprocal Rank Fusion + Weighted Hybrid
      const rrf = (1 / (60 + doc.bm25Rank)) + (1 / (60 + doc.vectorRank));
      const hybrid = parseFloat(((0.6 * vScore) + (0.4 * bScore)).toFixed(4));
      return {
        ...doc,
        fusedScore: hybrid > 0 ? hybrid : parseFloat((rrf * 10).toFixed(4)),
        score: hybrid > 0 ? hybrid : parseFloat((rrf * 10).toFixed(4))
      };
    });

    // 4. Sort initial candidates by fused score so top candidates have strong vector & text relevance
    candidates.sort((a, b) => (b.fusedScore || 0) - (a.fusedScore || 0));

    // Assign original candidate ranks 1..N
    candidates.forEach((doc, idx) => {
      doc.originalRank = idx + 1;
    });

    const beforeResults = candidates.slice(0, parseInt(limit));
    console.log(`✅ Retrieved & fused ${candidates.length} candidates (Top-${beforeResults.length} with active vector & BM25 scores)`);

    await mongoClient.close();

    // 3. Send to LLM for semantic reranking (with fallback support)
    console.log(`🤖 Sending ${candidates.length} candidates to LLM for semantic reranking...`);
    const llmStartTime = Date.now();

    const rerankedDocs = await rerankDocuments(query, candidates, parseInt(limit), {
      provider: req.body.provider,
      model: req.body.model
    });

    const rerankTime = Date.now() - llmStartTime;
    const totalTime = Date.now() - startTime;

    console.log(`✅ Semantic reranking complete in ${rerankTime}ms`);

    res.json({
      success: true,
      mode: 'semantic-rerank',
      query,
      filters,
      results: rerankedDocs || [],
      afterResults: rerankedDocs || [],
      beforeResults: beforeResults,
      candidates: beforeResults,
      count: (rerankedDocs || []).length,
      candidatesEvaluated: candidates.length,
      timing: {
        searchTime: totalTime - rerankTime,
        rerankTime: rerankTime,
        totalTime: totalTime
      },
      rerankModel: rerankedDocs[0]?.rerankModel || req.body.model || process.env.RERANK_MODEL || process.env.LLM_MODEL || 'multi-llm',
      rerankProvider: rerankedDocs[0]?.rerankProvider || req.body.provider || process.env.RERANK_PROVIDER || process.env.LLM_PROVIDER || 'groq',
      fallbackUsed: rerankedDocs[0]?.fallbackUsed || false,
      embeddingModel: process.env.EMBEDDING_MODEL || 'mistral-embed',
      tokens: embeddingResult.usage?.total_tokens || 0,
      cost: ((embeddingResult.usage?.total_tokens || 0) / 1000000) * 0.10,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Semantic reranking error:', error);
    res.status(500).json({
      error: 'Semantic reranking failed',
      details: error.message
    });
  }
}

// Search vector database
app.post('/api/search', async (req, res) => {
  try {
    const { query, limit = 5, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Create a MongoClient, connect once, validate DB/collection/index and reuse for the search
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });
    await mongoClient.connect();
    // Validate DB/collection/index and ensure documents exist
    const validation = await validateDbCollectionIndex(mongoClient, process.env.DB_NAME, process.env.COLLECTION_NAME, process.env.VECTOR_INDEX_NAME, true);
    if (!validation.ok) {
      try { await mongoClient.close(); } catch (e) { }
      return res.status(400).json({ error: validation.error });
    }

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Generate embedding for query using Mistral AI
    console.log('🔄 Generating embedding with Mistral AI...');
    const embeddingResult = await generateEmbedding(query);

    if (!embeddingResult || !embeddingResult.embedding) {
      throw new Error('Failed to generate embedding with Mistral AI');
    }

    const queryVector = embeddingResult.embedding;
    const tokens = embeddingResult.usage?.total_tokens || 0;
    const cost = (tokens / 1000000) * 0.10; // Mistral pricing: $0.10 per 1M tokens

    console.log(`✅ Embedding generated! Cost: $${cost.toFixed(6)}, Tokens: ${tokens}`);

    // Calculate candidates and internal limit for vector search
    const requestedLimit = parseInt(limit);
    const numCandidates = Math.max(100, requestedLimit * 10); // At least 100 candidates
    const vectorSearchLimit = Math.min(numCandidates, requestedLimit * 10); // Limit must be <= numCandidates

    // Build vector search WITHOUT pre-filtering (to avoid index requirement)
    const vectorSearchStage = {
      $vectorSearch: {
        queryVector,
        path: "embedding",
        numCandidates: numCandidates,
        limit: vectorSearchLimit, // Get more candidates for post-filtering
        index: process.env.VECTOR_INDEX_NAME
      }
    };

    // Build the pipeline
    const pipeline = [
      vectorSearchStage,
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    // Apply metadata filters using $match stage (works without index)
    if (Object.keys(filters).length > 0) {
      const matchConditions = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          matchConditions[key] = value;
        }
      });
      pipeline.push({
        $match: matchConditions
      });
      console.log('🔍 Applying filters with $match:', matchConditions);
    }

    // Add limit after filtering
    pipeline.push({
      $limit: requestedLimit
    });

    // Project fields
    pipeline.push({
      $project: {
        id: 1,
        module: 1,
        preRequisites: 1,
        title: 1,
        description: 1,
        steps: 1,
        expectedResults: 1,
        automationManual: 1,
        priority: 1,
        createdBy: 1,
        createdDate: 1,
        lastModifiedDate: 1,
        risk: 1,
        version: 1,
        type: 1,
        sourceFile: 1,
        createdAt: 1,
        score: 1
      }
    });

    console.log('🔍 Search Query:', query);
    console.log('🔍 Filters:', JSON.stringify(filters));
    console.log('🔍 Pipeline:', JSON.stringify(pipeline, null, 2));

    const results = await collection.aggregate(pipeline).toArray();
    console.log('✅ Found results:', results.length);

    await mongoClient.close();

    const responseData = {
      success: true,
      query,
      filters,
      results,
      cost: cost,
      tokens: tokens,
      model: 'mistral-embed'
    };

    console.log('📤 Sending response with', results.length, 'results');
    res.json(responseData);

  } catch (error) {
    console.error('❌ Search failed:', error.message);
    console.error('Error details:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// ======================== BM25 Field Weights & Helpers ========================
const BM25_FIELD_WEIGHTS = {
  id: 10.0,
  title: 5.0,
  module: 3.0,
  description: 2.0,
  expectedResults: 1.5,
  steps: 1.0,
  preRequisites: 0.8
};

function buildBM25SearchPipeline(indexName, query, filters = {}, limit = 10) {
  const searchFields = Object.entries(BM25_FIELD_WEIGHTS).map(([field, weight]) => ({
    text: {
      query: query,
      path: field,
      score: { boost: { value: weight } }
    }
  }));

  const pipeline = [
    {
      $search: {
        index: indexName,
        compound: {
          should: searchFields,
          minimumShouldMatch: 1
        }
      }
    },
    {
      $addFields: {
        score: { $meta: "searchScore" },
        bm25Score: { $meta: "searchScore" }
      }
    }
  ];

  if (Object.keys(filters).length > 0) {
    const matchConditions = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== '') {
        matchConditions[key] = value;
      }
    });
    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({ $match: matchConditions });
    }
  }

  pipeline.push(
    {
      $project: {
        _id: 1,
        id: 1,
        module: 1,
        title: 1,
        description: 1,
        steps: 1,
        expectedResults: 1,
        preRequisites: 1,
        priority: 1,
        risk: 1,
        automationManual: 1,
        sourceFile: 1,
        createdAt: 1,
        score: 1,
        bm25Score: 1
      }
    },
    { $limit: parseInt(limit) }
  );

  return pipeline;
}

function deduplicateResults(docs, keyField = 'id') {
  const seen = new Set();
  const deduped = [];
  for (const doc of docs) {
    const key = doc[keyField] || doc.testCaseId || doc.userStoryId || doc.storyId || doc.key || doc._id?.toString();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(doc);
    }
  }
  return deduped;
}

// ======================== BM25 Search Endpoint ========================
app.post('/api/search/bm25', async (req, res) => {
  try {
    const { query, limit = 10, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`🔤 BM25 Search request: "${query}"`);
    console.log(`   Limit: ${limit}`);
    console.log(`   Filters:`, filters);

    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await mongoClient.connect();

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Fetch extra candidates to account for deduplication
    const candidateLimit = Math.max(parseInt(limit) * 3, 30);
    const pipeline = buildBM25SearchPipeline(process.env.BM25_INDEX_NAME, query, filters, candidateLimit);

    console.log('🔍 BM25 Pipeline:', JSON.stringify(pipeline, null, 2));

    const startTime = Date.now();
    const rawResults = await collection.aggregate(pipeline).toArray();
    const searchTime = Date.now() - startTime;

    await mongoClient.close();

    // Deduplicate by test case ID
    const dedupedResults = deduplicateResults(rawResults, 'id');
    const results = dedupedResults.slice(0, parseInt(limit));

    console.log(`✅ BM25 Search complete: ${results.length} distinct results in ${searchTime}ms`);

    res.json({
      success: true,
      searchType: 'bm25',
      query,
      filters,
      results,
      count: results.length,
      searchTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ BM25 Search error:', error);
    res.status(500).json({
      error: 'BM25 search failed',
      details: error.message
    });
  }
});

// ======================== Hybrid Search Endpoint (BM25 + Vector) ========================
app.post('/api/search/hybrid', async (req, res) => {
  try {
    const {
      query,
      limit = 10,
      filters = {},
      bm25Weight = 0.5,
      vectorWeight = 0.5
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`🔀 Hybrid Search request: "${query}"`);
    console.log(`   BM25 Weight: ${bm25Weight}, Vector Weight: ${vectorWeight}`);

    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await mongoClient.connect();

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    const searchLimit = Math.max(parseInt(limit) * 4, 40);

    // 1. BM25 Search (with graceful fallback)
    let bm25Results = [];
    let bm25Time = 0;
    let bm25Available = false;
    const bm25StartTime = Date.now();

    try {
      console.log('🔤 Running BM25 search with weighted field boosting...');
      const bm25Pipeline = buildBM25SearchPipeline(process.env.BM25_INDEX_NAME, query, filters, searchLimit);
      bm25Results = await collection.aggregate(bm25Pipeline).toArray();
      bm25Time = Date.now() - bm25StartTime;
      bm25Available = true;
      console.log(`✅ BM25 search returned ${bm25Results.length} candidates in ${bm25Time}ms`);
    } catch (bm25Err) {
      console.warn(`⚠️ BM25 Search warning: ${bm25Err.message}`);
    }

    // 2. Vector Search with configured embedding provider
    console.log('🧠 Running vector search...');
    const vectorStartTime = Date.now();

    const embeddingResult = await generateEmbedding(query);

    if (!embeddingResult || !embeddingResult.embedding) {
      throw new Error('Failed to generate query embedding');
    }

    const queryVector = embeddingResult.embedding;
    const tokens = embeddingResult.usage?.total_tokens || 0;
    const embeddingCost = (tokens / 1000000) * 0.10;

    const vectorNumCandidates = Math.max(searchLimit * 2, 100);

    const vectorPipeline = [
      {
        $vectorSearch: {
          queryVector,
          path: "embedding",
          numCandidates: vectorNumCandidates,
          limit: searchLimit,
          index: process.env.VECTOR_INDEX_NAME
        }
      },
      {
        $addFields: {
          vectorScore: { $meta: "vectorSearchScore" },
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    if (Object.keys(filters).length > 0) {
      const matchConditions = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          matchConditions[key] = value;
        }
      });
      if (Object.keys(matchConditions).length > 0) {
        vectorPipeline.push({ $match: matchConditions });
      }
    }

    vectorPipeline.push({
      $project: {
        _id: 1,
        id: 1,
        module: 1,
        title: 1,
        description: 1,
        steps: 1,
        expectedResults: 1,
        priority: 1,
        risk: 1,
        automationManual: 1,
        sourceFile: 1,
        createdAt: 1,
        vectorScore: 1,
        score: 1
      }
    });

    const vectorResults = await collection.aggregate(vectorPipeline).toArray();
    const vectorTime = Date.now() - vectorStartTime;
    console.log(`✅ Vector search returned ${vectorResults.length} candidates in ${vectorTime}ms`);

    await mongoClient.close();

    // 3. Normalize and combine scores
    console.log('🔀 Combining results with score fusion...');

    const bm25Scores = bm25Results.map(r => r.score || r.bm25Score || 0);
    const bm25Max = Math.max(...bm25Scores, 1);

    const resultMap = new Map();

    // Seed with BM25 results
    bm25Results.forEach(result => {
      const key = result.id || result._id.toString();
      const rawScore = result.score || result.bm25Score || 0;
      const normalizedBm25 = bm25Max > 0 ? (rawScore / bm25Max) : 1.0;

      if (!resultMap.has(key)) {
        resultMap.set(key, {
          ...result,
          bm25Score: rawScore,
          bm25ScoreNormalized: parseFloat(normalizedBm25.toFixed(4)),
          vectorScore: 0,
          vectorScoreNormalized: 0,
          hybridScore: parseFloat((normalizedBm25 * bm25Weight).toFixed(4)),
          score: parseFloat((normalizedBm25 * bm25Weight).toFixed(4)),
          foundIn: 'bm25'
        });
      }
    });

    // Merge vector results (Vector cosine similarity is already 0.0 - 1.0)
    vectorResults.forEach(result => {
      const key = result.id || result._id.toString();
      const rawVector = result.score || result.vectorScore || 0;
      const normalizedVector = Math.min(1.0, Math.max(0.0, rawVector));

      if (resultMap.has(key)) {
        const existing = resultMap.get(key);
        existing.vectorScore = rawVector;
        existing.vectorScoreNormalized = parseFloat(normalizedVector.toFixed(4));
        const combinedScore = (existing.bm25ScoreNormalized * bm25Weight) + (normalizedVector * vectorWeight);
        existing.hybridScore = parseFloat(combinedScore.toFixed(4));
        existing.score = parseFloat(combinedScore.toFixed(4));
        existing.foundIn = 'both';
      } else {
        const combinedScore = normalizedVector * vectorWeight;
        resultMap.set(key, {
          ...result,
          bm25Score: 0,
          bm25ScoreNormalized: 0,
          vectorScore: rawVector,
          vectorScoreNormalized: parseFloat(normalizedVector.toFixed(4)),
          hybridScore: parseFloat(combinedScore.toFixed(4)),
          score: parseFloat(combinedScore.toFixed(4)),
          foundIn: 'vector'
        });
      }
    });

    let combinedResults = Array.from(resultMap.values());
    combinedResults.sort((a, b) => b.hybridScore - a.hybridScore);

    // Deduplicate by testcase ID
    const dedupedResults = deduplicateResults(combinedResults, 'id');
    const finalResults = dedupedResults.slice(0, parseInt(limit));

    const totalTime = Date.now() - bm25StartTime;
    console.log(`✅ Hybrid Search complete: ${finalResults.length} distinct results in ${totalTime}ms`);

    const bothCount = finalResults.filter(r => r.foundIn === 'both').length;
    const bm25OnlyCount = finalResults.filter(r => r.foundIn === 'bm25').length;
    const vectorOnlyCount = finalResults.filter(r => r.foundIn === 'vector').length;

    res.json({
      success: true,
      searchType: 'hybrid',
      query,
      filters,
      weights: { bm25: bm25Weight, vector: vectorWeight },
      results: finalResults,
      count: finalResults.length,
      stats: {
        foundInBoth: bothCount,
        foundInBm25Only: bm25OnlyCount,
        foundInVectorOnly: vectorOnlyCount,
        bm25ResultCount: bm25Results.length,
        vectorResultCount: vectorResults.length,
        bm25Available
      },
      timing: {
        bm25Time,
        vectorTime,
        totalTime
      },
      cost: embeddingCost,
      tokens: tokens,
      model: embeddingResult.model || 'mistral-embed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Hybrid Search error:', error);
    res.status(500).json({
      error: 'Hybrid search failed',
      details: error.message
    });
  }
});

// Reranking endpoint - Uses Multi-LLM for semantic reranking (with fallback support)
app.post('/api/search/rerank', async (req, res) => {
  try {
    const {
      query,
      limit = 10,
      filters = {},
      documents,
      results,
      rerankTopK = 50
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // If caller explicitly provides candidate documents/results to rerank
    const inputDocs = documents || results;
    if (Array.isArray(inputDocs) && inputDocs.length > 0) {
      const candidates = inputDocs.map((doc, idx) => ({
        ...doc,
        originalRank: doc.originalRank || (idx + 1)
      }));
      const beforeResults = candidates.slice(0, parseInt(limit));
      const startTime = Date.now();
      const rerankedDocs = await rerankDocuments(query, candidates, parseInt(limit), {
        provider: req.body.provider,
        model: req.body.model
      });
      const totalTime = Date.now() - startTime;
      return res.json({
        success: true,
        mode: 'semantic-rerank',
        query,
        filters,
        results: rerankedDocs,
        afterResults: rerankedDocs,
        beforeResults: beforeResults,
        candidates: beforeResults,
        count: rerankedDocs.length,
        candidatesEvaluated: candidates.length,
        timing: { searchTime: 0, rerankTime: totalTime, totalTime },
        rerankModel: rerankedDocs[0]?.rerankModel || req.body.model || process.env.RERANK_MODEL || 'multi-llm',
        rerankProvider: rerankedDocs[0]?.rerankProvider || req.body.provider || process.env.RERANK_PROVIDER || 'groq',
        fallbackUsed: rerankedDocs[0]?.fallbackUsed || false,
        timestamp: new Date().toISOString()
      });
    }

    return handleGroqOnlyReranking(req, res, query, limit, filters);

  } catch (error) {
    console.error('❌ Reranking error:', error);
    res.status(500).json({
      error: 'Reranking failed',
      details: error.message
    });
  }
});

// Get the latest test case ID from the database
app.get('/api/testcases/latest-id', async (req, res) => {
  try {
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
    });

    await mongoClient.connect();
    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(process.env.COLLECTION_NAME);

    // Find the highest numeric test case ID
    const testCases = await collection.find({}, { projection: { id: 1 } }).toArray();

    let maxId = 0;
    testCases.forEach(tc => {
      if (tc.id) {
        // Extract numeric part from TC_XXXX format
        const match = tc.id.match(/TC_(\d+)/);
        if (match) {
          const numId = parseInt(match[1], 10);
          if (numId > maxId) {
            maxId = numId;
          }
        }
      }
    });

    await mongoClient.close();

    res.json({
      success: true,
      latestId: maxId,
      nextId: maxId + 1,
      nextTestCaseId: `TC_${String(maxId + 1).padStart(4, '0')}`,
      totalTestCases: testCases.length
    });

  } catch (error) {
    console.error('❌ Error fetching latest test case ID:', error);
    res.status(500).json({
      error: 'Failed to fetch latest test case ID',
      details: error.message
    });
  }
});

// ======================== User Stories Hybrid Search Endpoint ========================
// Searches the user_stories collection using BM25 + Vector hybrid search
// Computes impact reason and regression risk for each retrieved story
app.post('/api/search/user-stories', async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      query,
      limit = 10,
      filters = {},
      bm25Weight = 0.4,
      vectorWeight = 0.6
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const usCollectionName = process.env.USER_STORIES_COLLECTION_NAME;
    const usVectorIndex = process.env.USER_STORIES_VECTOR_INDEX_NAME;
    const usBm25Index = process.env.USER_STORIES_BM25_INDEX_NAME;

    if (!usCollectionName || !usVectorIndex) {
      return res.status(400).json({
        error: 'USER_STORIES_COLLECTION_NAME and USER_STORIES_VECTOR_INDEX_NAME must be set in .env'
      });
    }

    console.log(`\n📖 User Stories Hybrid Search`);
    console.log(`   Query: "${query}"`);
    console.log(`   Collection: ${usCollectionName}`);
    console.log(`   Vector Index: ${usVectorIndex}`);
    console.log(`   BM25 Index: ${usBm25Index || 'not configured – vector-only mode'}`);

    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await mongoClient.connect();

    // Validate collection exists and has documents
    const collectionValidation = await validateDbCollectionIndex(
      mongoClient,
      process.env.DB_NAME,
      usCollectionName,
      null,   // index check done separately below
      true
    );

    if (!collectionValidation.ok) {
      await mongoClient.close();
      return res.status(400).json({ error: collectionValidation.error });
    }

    const db = mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(usCollectionName);
    const searchLimit = parseInt(limit) * 3;

    // ── 1. Vector Search ──────────────────────────────────────────────────────
    console.log('🧠 Running vector search on user_stories...');
    const vectorStart = Date.now();

    const embeddingResult = await generateEmbedding(query);
    if (!embeddingResult || !embeddingResult.embedding) {
      throw new Error('Failed to generate embedding');
    }

    const vectorPipeline = [
      {
        $vectorSearch: {
          queryVector: embeddingResult.embedding,
          path: 'embedding',
          numCandidates: Math.max(searchLimit * 2, 100),
          limit: searchLimit,
          index: usVectorIndex
        }
      },
      { $addFields: { vectorScore: { $meta: 'vectorSearchScore' } } },
      {
        $project: {
          _id: 1,
          key: 1,
          storyId: 1,
          summary: 1,
          description: 1,
          status: 1,
          priority: 1,
          components: 1,
          labels: 1,
          fixVersions: 1,
          epic: 1,
          sprint: 1,
          team: 1,
          acceptanceCriteria: 1,
          dependencies: 1,
          notes: 1,
          module: 1,
          vectorScore: 1
        }
      }
    ];

    const vectorResults = await collection.aggregate(vectorPipeline).toArray();
    const vectorTime = Date.now() - vectorStart;
    console.log(`✅ Vector search: ${vectorResults.length} results in ${vectorTime}ms`);

    // ── 2. BM25 Search (graceful fallback if index missing) ─────────────────
    let bm25Results = [];
    let bm25Time = 0;
    let bm25Available = false;

    if (usBm25Index) {
      try {
        console.log('🔤 Running BM25 search on user_stories...');
        const bm25Start = Date.now();

        const bm25Pipeline = [
          {
            $search: {
              index: usBm25Index,
              text: {
                query,
                path: ['summary', 'description', 'acceptanceCriteria', 'key']
              }
            }
          },
          { $addFields: { bm25Score: { $meta: 'searchScore' } } },
          {
            $project: {
              _id: 1,
              key: 1,
              storyId: 1,
              summary: 1,
              description: 1,
              status: 1,
              priority: 1,
              components: 1,
              labels: 1,
              fixVersions: 1,
              epic: 1,
              sprint: 1,
              team: 1,
              acceptanceCriteria: 1,
              dependencies: 1,
              notes: 1,
              module: 1,
              bm25Score: 1
            }
          },
          { $limit: searchLimit }
        ];

        bm25Results = await collection.aggregate(bm25Pipeline).toArray();
        bm25Time = Date.now() - bm25Start;
        bm25Available = true;
        console.log(`✅ BM25 search: ${bm25Results.length} results in ${bm25Time}ms`);
      } catch (bm25Err) {
        console.warn(`⚠️ BM25 search on user_stories failed (index may not exist): ${bm25Err.message}`);
        console.warn('   Falling back to vector-only mode');
      }
    }

    // ── 3. Score Normalisation & Hybrid Fusion ───────────────────────────────
    const resultMap = new Map();

    // Seed map with vector results (vector similarity is bounded [0, 1])
    vectorResults.forEach(doc => {
      const key = doc.key || doc.storyId || doc._id.toString();
      const normVector = Math.min(1.0, Math.max(0.0, doc.vectorScore || 0));
      resultMap.set(key, {
        ...doc,
        vectorScoreNormalized: parseFloat(normVector.toFixed(4)),
        bm25ScoreNormalized: 0,
        hybridScore: parseFloat((normVector * vectorWeight).toFixed(4)),
        foundIn: 'vector'
      });
    });

    if (bm25Available && bm25Results.length > 0) {
      const bm25Scores = bm25Results.map(r => r.bm25Score || 0);
      const bm25Max = Math.max(...bm25Scores, 1);

      bm25Results.forEach(doc => {
        const key = doc.key || doc.storyId || doc._id.toString();
        const rawBm25 = doc.bm25Score || 0;
        const normBm25 = bm25Max > 0 ? (rawBm25 / bm25Max) : 1.0;

        if (resultMap.has(key)) {
          const existing = resultMap.get(key);
          existing.bm25ScoreNormalized = parseFloat(normBm25.toFixed(4));
          const combined = (existing.vectorScoreNormalized * vectorWeight) + (normBm25 * bm25Weight);
          existing.hybridScore = parseFloat(combined.toFixed(4));
          existing.foundIn = 'both';
        } else {
          resultMap.set(key, {
            ...doc,
            vectorScoreNormalized: 0,
            bm25ScoreNormalized: parseFloat(normBm25.toFixed(4)),
            hybridScore: parseFloat((normBm25 * bm25Weight).toFixed(4)),
            foundIn: 'bm25'
          });
        }
      });
    }

    // ── 4. Sort, Filter, Deduplicate ─────────────────────────────────────────
    let combined = Array.from(resultMap.values());
    combined.sort((a, b) => b.hybridScore - a.hybridScore);

    // Apply optional filters
    if (Object.keys(filters).length > 0) {
      combined = combined.filter(doc =>
        Object.entries(filters).every(([k, v]) => !v || doc[k] === v)
      );
    }

    // Deduplicate by story key/id
    const seenKeys = new Set();
    combined = combined.filter(doc => {
      const storyKey = doc.key || doc.storyId || doc._id.toString();
      if (seenKeys.has(storyKey)) return false;
      seenKeys.add(storyKey);
      return true;
    });

    const finalResults = combined.slice(0, parseInt(limit));

    await mongoClient.close();

    // ── 5. Compute Impact Reason & Regression Risk per story ─────────────────
    const enrichedResults = finalResults.map(doc => {
      const score = doc.hybridScore;

      // Regression risk tier
      let regressionRisk = 'Low';
      if (score >= 0.80) regressionRisk = 'High';
      else if (score >= 0.60) regressionRisk = 'Medium';

      // Rule-based impact reason
      const reasons = [];

      if (score >= 0.80) {
        reasons.push('High functional similarity — directly related feature');
      } else if (score >= 0.60) {
        reasons.push('Related workflow or business flow');
      } else {
        reasons.push('Potentially impacted via shared functionality');
      }

      const docComponents = Array.isArray(doc.components) ? doc.components : [];
      const docLabels = Array.isArray(doc.labels) ? doc.labels : [];

      if (docComponents.length > 0) {
        reasons.push(`Shared component(s): ${docComponents.slice(0, 3).join(', ')}`);
      }
      if (docLabels.length > 0) {
        reasons.push(`Common label(s): ${docLabels.slice(0, 3).join(', ')}`);
      }
      if (doc.epic) {
        reasons.push(`Same epic/feature area: ${doc.epic}`);
      }
      if (doc.dependencies) {
        reasons.push(`Dependency: ${String(doc.dependencies).substring(0, 80)}`);
      }

      return {
        storyId: doc.key || doc.storyId || doc._id.toString(),
        title: doc.summary || 'Untitled User Story',
        description: doc.description || '',
        module: doc.module || doc.epic || 'General',
        status: typeof doc.status === 'object' ? (doc.status?.name || '') : (doc.status || ''),
        priority: typeof doc.priority === 'object' ? (doc.priority?.name || '') : (doc.priority || ''),
        components: docComponents,
        labels: docLabels,
        sprint: doc.sprint || null,
        team: doc.team || null,
        acceptanceCriteria: doc.acceptanceCriteria || '',
        dependencies: doc.dependencies || '',
        hybridScore: parseFloat(score.toFixed(4)),
        vectorScore: parseFloat((doc.vectorScoreNormalized || 0).toFixed(4)),
        bm25Score: parseFloat((doc.bm25ScoreNormalized || 0).toFixed(4)),
        foundIn: doc.foundIn,
        impactReason: reasons.join(' | '),
        regressionRisk,
        isHighRisk: regressionRisk === 'High'
      };
    });

    const totalTime = Date.now() - startTime;
    const tokens = embeddingResult.usage?.total_tokens || 0;
    const cost = (tokens / 1000000) * 0.10;

    console.log(`✅ User Stories search complete: ${enrichedResults.length} results in ${totalTime}ms`);

    res.json({
      success: true,
      query,
      filters,
      results: enrichedResults,
      count: enrichedResults.length,
      searchMode: bm25Available ? 'hybrid' : 'vector-only',
      stats: {
        vectorResultCount: vectorResults.length,
        bm25ResultCount: bm25Results.length,
        bm25Available,
        highRiskCount: enrichedResults.filter(r => r.regressionRisk === 'High').length,
        mediumRiskCount: enrichedResults.filter(r => r.regressionRisk === 'Medium').length
      },
      timing: { vectorTime, bm25Time, totalTime },
      tokens,
      cost,
      model: 'mistral-embed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ User stories search error:', error);
    res.status(500).json({
      error: 'User stories search failed',
      details: error.message
    });
  }
});

// ======================== Resilient Server Startup with Auto-Retry ========================
let serverInstance = null;

function killPortProcess(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const lines = output.split('\n').filter(l => l.includes('LISTENING') && l.includes(`:${port}`));
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && Number(pid) !== process.pid && Number(pid) !== 0) {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`🧹 Reclaimed port ${port} from old process ${pid}`);
        } catch (err) {}
      }
    }
  } catch (e) {}
}

function startServer(port, retries = 5, delay = 1000) {
  const server = app.listen(port, () => {
    serverInstance = server;
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📡 API available at http://localhost:${port}/api`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} is busy. Automatically reclaiming port...`);
      killPortProcess(port);
      if (retries > 0) {
        setTimeout(() => {
          try {
            server.close();
          } catch (e) {}
          startServer(port, retries - 1, delay);
        }, delay);
      } else {
        console.error(`❌ Port ${port} could not be bound after retries.`);
      }
    } else {
      console.error('⚠️ Server network/socket error:', err.message);
    }
  });

  return server;
}

// Graceful shutdown handlers to ensure port is freed immediately on restart
let isShuttingDown = false;
function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}, releasing port ${PORT}...`);
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('✅ Port released cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(0);
    }, 2000).unref();
  } else {
    process.exit(0);
  }
}

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startServer(PORT);
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeDatasetGapsStreaming, selectRelevantTraces, runBatchJobAnalysis } from "./services/openai";
import multer from "multer";
import { z } from "zod";
import fs from "fs";
import path from "path";

const upload = multer({ storage: multer.memoryStorage() });

const uploadDataSchema = z.object({
  langsmithTraces: z.array(z.string()),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload and store files
  app.post("/api/upload", upload.fields([
    { name: 'langsmithFile', maxCount: 1 },
  ]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } || {};
      let langsmithContent = '';

      // Store LangSmith traces file content
      if (files?.langsmithFile && files.langsmithFile[0]) {
        langsmithContent = files.langsmithFile[0].buffer.toString();
      }

      // Check if files were uploaded
      if (!langsmithContent) {
        return res.status(400).json({ 
          error: "No files uploaded. Please upload your trace file." 
        });
      }

      // Generate basic file summary
      const langsmithCount = langsmithContent ? langsmithContent.split('\n').filter(q => q.trim() !== '').length : 0;
      
      console.log('📤 Upload debug:', {
        contentLength: langsmithContent.length,
        langsmithCount,
        firstLine: langsmithContent.split('\n')[0]?.substring(0, 100) || 'empty'
      });

      // Store the raw files
      const analysisResult = await storage.createAnalysis({
        langsmithContent,
        datasetFiles: [],
        analysisData: {
          transactionDistribution: {},
          coverageScore: 0,
          gaps: [],
          insights: []
        }
      });

      console.log('💾 Stored analysis:', {
        id: analysisResult.id,
        storedContentLength: analysisResult.langsmithContent?.length || 0
      });

      res.json({
        id: analysisResult.id,
        langsmithCount,
        analysis: analysisResult.analysisData
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: "Failed to process uploaded files" });
    }
  });

  // Dataset management routes
  app.post("/api/datasets", upload.single('datasetFile'), async (req, res) => {
    try {
      console.log('Dataset upload request received');
      console.log('File:', req.file ? 'Present' : 'Missing');
      console.log('Body:', req.body);

      const file = req.file;
      const { name, description } = req.body;

      if (!file) {
        console.log('No file uploaded');
        return res.status(400).json({ error: "No dataset file uploaded" });
      }

      if (!name) {
        console.log('No name provided');
        return res.status(400).json({ error: "Dataset name is required" });
      }

      console.log('File details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });

      // Parse JSON content
      let content;
      try {
        const fileContent = file.buffer.toString('utf8');
        console.log('File content preview:', fileContent.substring(0, 200));
        content = JSON.parse(fileContent);
        console.log('JSON parsed successfully');
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.log('Raw file content:', file.buffer.toString('utf8').substring(0, 500));
        return res.status(400).json({ 
          error: `Invalid JSON format: ${parseError.message}` 
        });
      }

      const dataset = await storage.createDataset({
        name,
        filename: file.originalname,
        content,
        description: description || null,
        size: file.size
      });

      console.log('Dataset created successfully:', dataset.id);
      res.json(dataset);
    } catch (error) {
      console.error('Dataset upload error:', error);
      res.status(500).json({ error: "Failed to upload dataset" });
    }
  });

  app.get("/api/datasets", async (req, res) => {
    try {
      const datasets = await storage.getAllDatasets();
      res.json(datasets);
    } catch (error) {
      console.error('Get datasets error:', error);
      res.status(500).json({ error: "Failed to retrieve datasets" });
    }
  });

  app.get("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dataset = await storage.getDataset(id);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      res.json(dataset);
    } catch (error) {
      console.error('Get dataset error:', error);
      res.status(500).json({ error: "Failed to retrieve dataset" });
    }
  });

  app.delete("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDataset(id);

      if (!deleted) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete dataset error:', error);
      res.status(500).json({ error: "Failed to delete dataset" });
    }
  });

  // Get analysis by ID
  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getAnalysis(id);

      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      console.log('📥 Get analysis debug:', {
        id,
        hasAnalysis: !!analysis,
        contentLength: analysis?.langsmithContent?.length || 0,
        traceCount: analysis?.langsmithContent ? analysis.langsmithContent.split('\n').filter(line => line.trim() !== '').length : 0
      });

      res.json(analysis);
    } catch (error) {
      console.error('Get analysis error:', error);
      res.status(500).json({ error: "Failed to retrieve analysis" });
    }
  });

  // Analyze traces endpoint - streaming response
  app.post("/api/analyze", async (req, res) => {
    try {
      const { analysisId, query, model, reasoningModel, customPrompt, customReasoningPrompt, maxTracesForReasoning, fallbackTraces } = req.body;

      if (!analysisId || !query) {
        return res.status(400).json({ error: 'Analysis ID and query are required' });
      }

      const analysis = await storage.getAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      console.log(`📊 ANALYSIS DEBUG:`, {
        id: analysisId,
        hasContent: !!analysis.langsmithContent,
        contentLength: analysis.langsmithContent?.length || 0,
        firstChars: analysis.langsmithContent?.substring(0, 100) || 'EMPTY',
        traceCount: analysis.langsmithContent ? analysis.langsmithContent.split('\n').filter(line => line.trim() !== '').length : 0
      });

      // Use fallback traces if analysis content is missing
      let tracesContent = analysis.langsmithContent || '';
      if (!tracesContent && fallbackTraces && Array.isArray(fallbackTraces)) {
        console.log(`🔄 Using fallback traces: ${fallbackTraces.length} traces from cache`);
        tracesContent = fallbackTraces.join('\n');
      } else if (fallbackTraces && Array.isArray(fallbackTraces) && fallbackTraces.length > 0) {
        // Always use fallback traces if they exist, even if analysis content exists
        console.log(`🔄 Using fallback traces (override): ${fallbackTraces.length} traces from cache`);
        tracesContent = fallbackTraces.join('\n');
      }
      
      if (!tracesContent) {
        console.log(`⚠️ NO TRACES AVAILABLE - neither from analysis nor fallback`);
      }

      const datasets = await storage.getAllDatasets();
      
      console.log(`🤖 MODELS: Analysis="${model || "gpt-4o"}" | Reasoning="${reasoningModel || "o4-mini"}"`);
      console.log(`⚡ OPTIMIZATION: MaxTraces=${maxTracesForReasoning || 250} (used by both models)`);
      
      const lines = (tracesContent || '').split('\n').filter(line => line.trim() !== '');

      // Set up streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
      
      // Handle client disconnect and create abort controller
      let clientDisconnected = false;
      const abortController = new AbortController();
      
      req.on('close', () => {
        clientDisconnected = true;
        abortController.abort();
      });
      
      req.on('aborted', () => {
        clientDisconnected = true;
        abortController.abort();
      });

      // Send initial heartbeat to test connection
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', message: 'Connection established' })}\n\n`);
      if (res.flush) res.flush();
      const streamingResult = await analyzeDatasetGapsStreaming(
        tracesContent,
        datasets, // Pass all uploaded datasets
        query,
        model || "gpt-4o",
        reasoningModel || "o4-mini",
        (chunk) => {
          // Check if client disconnected before trying to write
          if (clientDisconnected || req.aborted || res.destroyed || res.closed) {
            return;
          }
          
          try {
            res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
            if (res.flush) res.flush();
          } catch (e) {
            clientDisconnected = true;
          }
        },
        customPrompt,
        req.body.chatHistory, // Pass the complete chat history
        abortController.signal, // Pass abort signal to OpenAI function
        maxTracesForReasoning || 250 // Same trace count for both models
      );

      res.write(`data: ${JSON.stringify({ type: 'streaming_complete' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'reasoning_start' })}\n\n`);

      // Only proceed with reasoning if not aborted
      let tracesWithTags: Array<{ trace: string; tags: string[] }> = [];
      if (!clientDisconnected && !req.aborted && !res.destroyed) {
        tracesWithTags = await selectRelevantTraces(
          tracesContent,
          query,
          streamingResult.response,
          reasoningModel || "o4-mini",
          customReasoningPrompt,
          req.body.chatHistory,
          abortController.signal,
          streamingResult.selectedTraces // Pass the same traces used in analysis
        );
      }
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        tracesWithTags: tracesWithTags 
      })}\n\n`);

      res.end();

    } catch (error) {
      console.error('Analysis error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  });

  // Update default prompts in config file
  app.post("/api/update-default-prompt", async (req, res) => {
    try {
      const { type, prompt } = req.body;
      
      if (!type || !prompt) {
        return res.status(400).json({ error: 'Type and prompt are required' });
      }

      const configPath = path.join(process.cwd(), 'shared/config.ts');
      let content = fs.readFileSync(configPath, 'utf8');

      if (type === 'analysis') {
        // Update the analysis prompt in the config
        const analysisPromptRegex = /analysis: `[^`]*`/s;
        const newAnalysisPrompt = `analysis: \`${prompt.replace(/`/g, '\\`')}\``;
        content = content.replace(analysisPromptRegex, newAnalysisPrompt);
      } else if (type === 'reasoning') {
        // Update the reasoning prompt in the config
        const reasoningPromptRegex = /reasoning: `[^`]*`/s;
        const newReasoningPrompt = `reasoning: \`${prompt.replace(/`/g, '\\`')}\``;
        content = content.replace(reasoningPromptRegex, newReasoningPrompt);
      }

      fs.writeFileSync(configPath, content);
      res.json({ success: true });
    } catch (error) {
      console.error('Update prompt error:', error);
      res.status(500).json({ error: "Failed to update default prompt" });
    }
  });

  // Batch job analysis endpoint
  app.post("/api/batch-job", async (req, res) => {
    try {
      const { analysisId, query, model = 'gpt-4o', maxResults = 30, fallbackTraces } = req.body;

      if (!analysisId || !query) {
        return res.status(400).json({ error: 'Analysis ID and query are required' });
      }

      const analysis = await storage.getAnalysis(analysisId);
      if (!analysis && !fallbackTraces) {
        return res.status(404).json({ error: "Analysis not found and no fallback traces provided" });
      }

      // Use fallback traces if analysis content is missing
      let traces: string[] = [];
      if (analysis?.langsmithContent) {
        traces = analysis.langsmithContent.split('\n').filter(line => line.trim() !== '');
      }
      
      // If no traces from analysis or fallbackTraces provided, use fallback
      if ((traces.length === 0 || !analysis) && fallbackTraces && Array.isArray(fallbackTraces)) {
        console.log(`🔄 Using fallback traces for batch job: ${fallbackTraces.length} traces from cache`);
        traces = fallbackTraces;
      }
      
      if (traces.length === 0) {
        return res.json({ results: [] });
      }

      console.log(`🔍 BATCH JOB: Query="${query}" | Model=${model} | MaxResults=${maxResults} | TotalTraces=${traces.length}`);

      // Use AI to analyze traces and find relevant examples
      const results = await runBatchJobAnalysis(traces, query, maxResults, model);

      res.json({ results });
    } catch (error) {
      console.error('Batch job error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to run batch job' });
    }
  });

  // Get batch jobs for an analysis
  app.get("/api/batch-jobs/:analysisId", async (req, res) => {
    try {
      const analysisId = parseInt(req.params.analysisId);
      const jobs = await storage.getBatchJobsByAnalysis(analysisId);
      res.json(jobs);
    } catch (error) {
      console.error('Get batch jobs error:', error);
      res.status(500).json({ error: 'Failed to get batch jobs' });
    }
  });

  // Save batch jobs for an analysis
  app.post("/api/batch-jobs", async (req, res) => {
    try {
      const { analysisId, jobs } = req.body;
      
      if (!analysisId || !Array.isArray(jobs)) {
        return res.status(400).json({ error: 'Analysis ID and jobs array are required' });
      }

      const savedJobs = await storage.saveBatchJobs(analysisId, jobs);
      res.json(savedJobs);
    } catch (error) {
      console.error('Save batch jobs error:', error);
      res.status(500).json({ error: 'Failed to save batch jobs' });
    }
  });

  // Update batch job status/results
  app.put("/api/batch-jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const updatedJob = await storage.updateBatchJob(id, updates);
      if (!updatedJob) {
        return res.status(404).json({ error: 'Batch job not found' });
      }
      
      res.json(updatedJob);
    } catch (error) {
      console.error('Update batch job error:', error);
      res.status(500).json({ error: 'Failed to update batch job' });
    }
  });

  // Delete batch job
  app.delete("/api/batch-jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteBatchJob(id);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Batch job not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete batch job error:', error);
      res.status(500).json({ error: 'Failed to delete batch job' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
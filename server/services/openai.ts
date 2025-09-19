import OpenAI from "openai";
import { storage } from "../storage";
import { DEFAULT_PROMPTS } from "@shared/config";

// Fisher-Yates shuffle algorithm with optional seed
function shuffleArray<T>(array: T[], seed?: number): T[] {
  const shuffled = [...array];
  
  // Simple seeded random number generator (LCG)
  let rng = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
  const seededRandom = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "",
});

export async function analyzeDatasetGapsStreaming(
  langsmithContent: string,
  datasets: Array<{ id: number; name: string; filename: string; content: any; description?: string | null; size: number; createdAt: Date }>,
  userQuery: string,
  model: string = "gpt-4o",
  reasoningModel: string = "o4-mini",
  onChunk: (chunk: string) => void,
  customPrompt?: string,
  chatHistory?: Array<{ id: string; type: 'user' | 'assistant'; content: string; timestamp: number }>,
  abortSignal?: AbortSignal,
  maxTracesForAnalysis: number = 250, // Renamed and use same count for both analysis and reasoning
  onResponseReady?: (response: string, selectedTraces: Array<{ trace: string; originalIndex: number }>) => void // Callback when complete response is ready
): Promise<{
  response: string;
  examples: string[];
  quickTraces?: Array<{ trace: string; tags: string[] }>;
  selectedTraces?: Array<{ trace: string; originalIndex: number }>;
}> {
  const traces = langsmithContent.split("\n").filter((line) => line.trim() !== "");

  if (traces.length === 0) {
    return {
      response: "ERROR: No traces found in the uploaded data.",
      examples: [],
      quickTraces: [],
      selectedTraces: []
    };
  }

  // Use same trace count for both analysis and reasoning for consistency
  const tracesWithIndexes = traces.map((trace, index) => ({ 
    trace, 
    originalIndex: index + 1 
  }));
  
  // Create deterministic seed based on content hash for consistent shuffling
  const contentSeed = traces.join('').length % 100000;
  const shuffledTraces = shuffleArray(tracesWithIndexes, contentSeed);
  const selectedTraces = shuffledTraces.slice(0, Math.min(maxTracesForAnalysis, traces.length));
  
  console.log(`📊 TRACE ALLOCATION: Both Analysis & Reasoning=${selectedTraces.length} (from ${traces.length} total)`);
  console.log(`🎲 SHUFFLE SEED: ${contentSeed} (deterministic based on content)`);
  
  // Create traces section with original line numbers preserved
  const tracesSection = `${selectedTraces.map(({ trace, originalIndex }) => `${originalIndex}: ${trace}`).join("\n")}

📊 FOCUS: These traces are your PRIMARY data source (${selectedTraces.length} traces selected from ${traces.length} total).`;

  // Create datasets section if datasets are available
  let datasetsSection = '';
  if (datasets && datasets.length > 0) {
    // Format datasets in a more readable way for the AI
    const formattedDatasets = datasets.map((dataset, index) => {
      let contentPreview = '';
      try {
        if (dataset.content) {
          // If it's a LangSmith-style dataset, extract examples
          if (dataset.content.examples && Array.isArray(dataset.content.examples)) {
            const examples = dataset.content.examples.slice(0, 5); // Show first 5 examples
            contentPreview = `Examples from this dataset:\n${examples.map((ex: any, i: number) => 
              `Example ${i + 1}: ${JSON.stringify(ex, null, 2)}`
            ).join('\n\n')}${dataset.content.examples.length > 5 ? `\n... and ${dataset.content.examples.length - 5} more examples` : ''}`;
          } else {
            // For other JSON structures, show a formatted version
            contentPreview = `Content structure:\n${JSON.stringify(dataset.content, null, 2).slice(0, 1000)}${JSON.stringify(dataset.content).length > 1000 ? '...' : ''}`;
          }
        }
      } catch (e) {
        contentPreview = 'Unable to parse dataset content';
      }

      return `
Dataset ${index + 1}: "${dataset.name}"
- Filename: ${dataset.filename}
- Description: ${dataset.description || 'No description provided'}
- Size: ${(dataset.size / 1024).toFixed(1)}KB
- Total examples: ${dataset.content?.examples?.length || 'Unknown'}

${contentPreview}
`;
    }).join('\n');

    datasetsSection = `(${datasets.length} available):
${formattedDatasets}

💡 CONTEXT: These datasets contain structured examples that can provide additional context for your analysis. Reference them when relevant to the user's question. Look for patterns, similarities, or differences between the production traces and these examples.`;
  } else {
    datasetsSection = 'No datasets uploaded.';
  }

  // Use custom prompt or default
  let analysisPrompt = customPrompt || DEFAULT_PROMPTS.analysis;

  // Create conversation context including current question
  const conversationContext = chatHistory && chatHistory.length > 0 ? 
    chatHistory.map(msg => `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n\n') + `\n\nUser: ${userQuery}` : 
    `User: ${userQuery}`;

  // Replace variables in the prompt
  const finalPrompt = analysisPrompt
    .replace('{conversation}', conversationContext)
    .replace('{traces}', tracesSection)
    .replace('{datasets}', datasetsSection);

  // Log the number of traces being sent to the chat model
  console.log(`📤 SENDING TO CHAT MODEL: ${selectedTraces.length} traces | Model: ${model}`);

  try {
    // First, get the complete response (non-streaming)
    const completeResponse = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: finalPrompt }],
    }, {
      signal: abortSignal
    });

    const fullResponse = completeResponse.choices[0]?.message?.content || '';
    
    // Notify that complete response is ready for parallel processing
    if (onResponseReady) {
      onResponseReady(fullResponse, selectedTraces);
    }

    // Now stream the response word by word for UI effect
    const words = fullResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (abortSignal?.aborted) {
        break;
      }
      
      const word = words[i];
      onChunk(i === 0 ? word : ' ' + word);
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    return {
      response: fullResponse,
      examples: [],
      quickTraces: [], // No quick traces, only reasoning model traces
      selectedTraces: selectedTraces, // Pass same traces for reasoning
    };
  } catch (error) {
    console.error("Analysis error:", error);
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function selectRelevantTraces(
  langsmithContent: string,
  userQuery: string,
  aiResponse: string,
  model: string = "o4-mini",
  customPrompt?: string,
  chatHistory?: Array<{ id: string; type: 'user' | 'assistant'; content: string; timestamp: number }>,
  abortSignal?: AbortSignal,
  preSelectedTraces?: Array<{ trace: string; originalIndex: number }>
): Promise<Array<{ trace: string; tags: string[] }>> {
  const functionStartTime = Date.now();
  console.log(`🚀 REASONING START - Model: ${model}`);
  
  // Step 1: Prepare traces for reasoning
  const tracesPrepStartTime = Date.now();
  let tracesForReasoning: Array<{ trace: string; originalIndex: number }>;
  
  if (preSelectedTraces && preSelectedTraces.length > 0) {
    tracesForReasoning = preSelectedTraces;
    console.log(`📝 Using pre-selected traces: ${tracesForReasoning.length} traces`);
  } else {
    console.log(`📝 Fallback: Processing traces from langsmith content`);
    const allTraces = langsmithContent
      .split("\n")
      .filter((line) => line.trim() !== "");

    const limitedTraces = allTraces.slice(0, 250);
    
    const tracesWithIndexes = limitedTraces.map((trace, index) => ({ 
      trace, 
      originalIndex: index + 1 
    }));
    // Use same deterministic seed for consistency
    const contentSeed = limitedTraces.join('').length % 100000;
    tracesForReasoning = shuffleArray(tracesWithIndexes, contentSeed);
  }
  
  const tracesPrepDuration = Date.now() - tracesPrepStartTime;
  console.log(`⚡ TRACES PREP: ${tracesPrepDuration}ms - ${tracesForReasoning.length} traces ready`);

  // Step 2: Optimize function schema - reduce complexity for faster processing
  const schemaStartTime = Date.now();
  const traceSelectionFunction = [
    {
      name: "select_and_tag_traces",
      description: "Select EXACTLY 20 most relevant traces and tag them",
      parameters: {
        type: "object",
        properties: {
          selected_traces: {
            type: "array",
            items: {
              type: "object",
              properties: {
                line_number: { type: "number" },
                relevance_score: { type: "number" },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "1-3 specific tags"
                }
              },
              required: ["line_number", "relevance_score", "tags"]
            },
            minItems: 20,
            maxItems: 20
          }
        },
        required: ["selected_traces"]
      }
    }
  ];
  
  const schemaDuration = Date.now() - schemaStartTime;
  console.log(`⚡ SCHEMA PREP: ${schemaDuration}ms`);

  // Step 3: Build optimized prompt - reduce size for faster processing
  const promptStartTime = Date.now();
  let reasoningPrompt = customPrompt || DEFAULT_PROMPTS.reasoning;

  // Optimize conversation context - limit size to reduce tokens
  const maxConversationLength = 2000;
  let conversationContext = chatHistory && chatHistory.length > 0 ? 
    chatHistory.map(msg => `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n\n') + 
    `\n\nUser: ${userQuery}\n\nAI: ${aiResponse}` : 
    `User: ${userQuery}\n\nAI: ${aiResponse}`;
    
  if (conversationContext.length > maxConversationLength) {
    conversationContext = conversationContext.slice(-maxConversationLength);
    console.log(`✂️ CONVERSATION TRUNCATED: ${conversationContext.length} chars (was longer)`);
  }

  // Optimize traces - limit trace length to reduce tokens
  const maxTraceLength = 200;
  const optimizedTraces = tracesForReasoning.map(({ trace, originalIndex }) => {
    const truncatedTrace = trace.length > maxTraceLength ? trace.slice(0, maxTraceLength) + '...' : trace;
    return `${originalIndex}: ${truncatedTrace}`;
  }).join("\n");

  reasoningPrompt = reasoningPrompt
    .replace('{conversation}', conversationContext)
    .replace('{traces}', optimizedTraces);

  const promptDuration = Date.now() - promptStartTime;
  console.log(`⚡ PROMPT BUILD: ${promptDuration}ms`);
  console.log(`📊 PROMPT STATS: ${Math.round(reasoningPrompt.length / 1000)}k chars, ${tracesForReasoning.length} traces`);

  // Step 4: Make OpenAI API call with detailed timing
  const apiCallStartTime = Date.now();
  console.log(`🌐 API CALL START - Model: ${model}`);

  try {
    if (abortSignal?.aborted) {
      console.log(`⚠️ ABORTED before API call`);
      return [];
    }
    
    const reasoningResponse = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: reasoningPrompt }],
      functions: traceSelectionFunction,
      function_call: { name: "select_and_tag_traces" },
      reasoning_effort: "low" // Reduce reasoning time for faster responses
    }, {
      signal: abortSignal
    });

    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log(`🌐 API CALL COMPLETE: ${apiCallDuration}ms (${(apiCallDuration / 1000).toFixed(1)}s)`);

    // Step 5: Process response with detailed timing
    const processingStartTime = Date.now();
    let tracesWithTags: Array<{ trace: string; tags: string[] }> = [];

    if (reasoningResponse.choices[0].message.function_call) {
      const parseStartTime = Date.now();
      
      try {
        const reasoningArgs = JSON.parse(reasoningResponse.choices[0].message.function_call.arguments);
        const parseDuration = Date.now() - parseStartTime;
        console.log(`⚡ JSON PARSE: ${parseDuration}ms`);
        
        if (reasoningArgs.selected_traces && reasoningArgs.selected_traces.length > 0) {
          const mappingStartTime = Date.now();
          const selectedTraces = reasoningArgs.selected_traces;

          tracesWithTags = selectedTraces.map((item: any) => {
            const lineNumber = item.line_number;
            const matchingTrace = tracesForReasoning.find(t => t.originalIndex === lineNumber);
            const trace = matchingTrace ? matchingTrace.trace : "";
            
            return {
              trace: trace,
              tags: item.tags || []
            };
          });
          
          const mappingDuration = Date.now() - mappingStartTime;
          console.log(`⚡ TRACE MAPPING: ${mappingDuration}ms - ${tracesWithTags.length} traces mapped`);
        }
      } catch (e) {
        console.error("❌ Error parsing reasoning response:", e);
        const errorDuration = Date.now() - parseStartTime;
        console.log(`⚡ ERROR HANDLING: ${errorDuration}ms`);
      }
    } else {
      console.log(`⚠️ No function call in response`);
    }
    
    const processingDuration = Date.now() - processingStartTime;
    console.log(`⚡ RESPONSE PROCESSING: ${processingDuration}ms`);

    // Step 6: Final timing summary
    const totalDuration = Date.now() - functionStartTime;
    const breakdown = {
      tracesPrep: tracesPrepDuration,
      schemaPrep: schemaDuration,
      promptBuild: promptDuration,
      apiCall: apiCallDuration,
      processing: processingDuration,
      total: totalDuration
    };
    
    console.log(`🎯 REASONING COMPLETE: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log(`📈 BREAKDOWN: API=${apiCallDuration}ms (${((apiCallDuration/totalDuration)*100).toFixed(1)}%), Processing=${processingDuration}ms (${((processingDuration/totalDuration)*100).toFixed(1)}%), Other=${totalDuration-apiCallDuration-processingDuration}ms`);
    console.log(`🎯 RETURNED: ${tracesWithTags.length} traces with tags`);

    return tracesWithTags;
  } catch (error) {
    const errorDuration = Date.now() - apiCallStartTime;
    console.error(`❌ REASONING ERROR after ${errorDuration}ms:`, error);
    return [];
  }
}

export async function runBatchJobAnalysis(
  traces: string[],
  query: string,
  maxResults: number = 30,
  model: string = "gpt-4o"
): Promise<Array<{ trace: string; originalIndex: number; relevanceScore: number; reasoning: string }>> {
  const startTime = Date.now();
  console.log(`🚀 BATCH JOB START - Query: "${query}" | Model: ${model} | MaxResults: ${maxResults} | Traces: ${traces.length}`);

  try {
    // Create a function schema for batch job analysis
    const batchJobFunction = [
      {
        name: "analyze_traces_for_batch_job",
        description: `Analyze traces and find up to ${maxResults} examples that match the query criteria`,
        parameters: {
          type: "object",
          properties: {
            matching_traces: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line_number: { type: "number", description: "The line number of the trace (1-based)" },
                  relevance_score: { type: "number", minimum: 0, maximum: 1, description: "How well this trace matches the query (0-1)" },
                  reasoning: { type: "string", description: "Brief explanation of why this trace matches the query" }
                },
                required: ["line_number", "relevance_score", "reasoning"]
              },
              maxItems: maxResults
            }
          },
          required: ["matching_traces"]
        }
      }
    ];

    // Create the prompt for batch job analysis
    const tracesWithNumbers = traces.map((trace, index) => `${index + 1}: ${trace}`).join('\n');
    
    const prompt = `You are analyzing production traces to find examples that match a specific query.

QUERY: ${query}

TRACES TO ANALYZE:
${tracesWithNumbers}

INSTRUCTIONS:
1. Carefully read through all traces and identify all the ones that match the query criteria
2. Score each matching trace from 0.0 to 1.0 based on how well it matches the query
3. Provide a brief reasoning for why each trace matches
4. Return up to ${maxResults} of the best matching traces, ordered by relevance score (highest first)
5. Only include traces that genuinely match the query criteria
6. If no traces match, return an empty array

Be thorough but selective - quality over quantity.`;

    // Build the request parameters
    const requestParams: any = {
      model: model,
      messages: [{ role: "user", content: prompt }],
      functions: batchJobFunction,
      function_call: { name: "analyze_traces_for_batch_job" }
    };

    // Only add temperature for models that support it (not o4-mini, o3, o3-mini)
    if (!model.includes('o4-mini') && !model.includes('o3')) {
      requestParams.temperature = 0.1; // Low temperature for consistent results
    }

    const response = await openai.chat.completions.create(requestParams);

    const duration = Date.now() - startTime;
    console.log(`⚡ BATCH JOB API CALL: ${duration}ms`);

    let results: Array<{ trace: string; originalIndex: number; relevanceScore: number; reasoning: string }> = [];

    if (response.choices[0].message.function_call) {
      try {
        const analysisResult = JSON.parse(response.choices[0].message.function_call.arguments);
        
        if (analysisResult.matching_traces && Array.isArray(analysisResult.matching_traces)) {
          results = analysisResult.matching_traces
            .filter((item: any) => item.line_number && item.line_number >= 1 && item.line_number <= traces.length)
            .map((item: any) => ({
              trace: traces[item.line_number - 1], // Convert to 0-based index
              originalIndex: item.line_number - 1,
              relevanceScore: Math.min(1, Math.max(0, item.relevance_score || 0)),
              reasoning: item.reasoning || "No reasoning provided"
            }))
            .sort((a: { relevanceScore: number }, b: { relevanceScore: number }) => b.relevanceScore - a.relevanceScore); // Sort by relevance score descending
        }
      } catch (e) {
        console.error("❌ Error parsing batch job response:", e);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`🎯 BATCH JOB COMPLETE: ${totalDuration}ms | Found ${results.length} matching traces`);
    
    return results;
  } catch (error) {
    const errorDuration = Date.now() - startTime;
    console.error(`❌ BATCH JOB ERROR after ${errorDuration}ms:`, error);
    throw error;
  }
}

export async function generateInitialAnalysis(
  langsmithCount: number,
  datasetCount: number,
): Promise<{
  transactionDistribution: Record<string, number>;
  coverageScore: number;
  gaps: any[];
  insights: any[];
}> {
  return {
    transactionDistribution: {},
    coverageScore: 0,
    gaps: [],
    insights: [],
  };
}
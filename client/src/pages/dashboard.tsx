import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DEFAULT_PROMPTS } from '@shared/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Upload, FileText, MessageCircle, Lightbulb, Search, X, Download, CheckSquare, Square, Star, StopCircle, Eye, Settings, Save, Filter, BarChart3 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BatchJobManager from '@/components/BatchJobManager';

interface Dataset {
  id: number;
  name: string;
  filename: string;
  description?: string;
  size: number;
  createdAt: string;
}

interface Analysis {
  id: number;
  langsmithContent: string;
  analysisData: {
    transactionDistribution: Record<string, number>;
    coverageScore: number;
    gaps: any[];
    insights: any[];
  };
}

interface AnalysisResult {
  response: string;
      examples: string[];
  tracesWithTags: Array<{ trace: string; tags: string[] }>;
  query: string;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tracesWithTags?: Array<{ trace: string; tags: string[] }>;
}

interface BatchJob {
  id: string;
  name: string;
  query: string;
  model: string;
  maxResults: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  results?: BatchJobResult[];
  error?: string;
  createdAt: string;
  lastRunAt?: string;
}

interface BatchJobResult {
  trace: string;
  originalIndex: number;
  relevanceScore: number;
  reasoning: string;
}

export default function Dashboard() {
  const [files, setFiles] = useState<{ langsmithFile?: File }>({});
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [reasoningModel, setReasoningModel] = useState('o4-mini');
  const [chatPrompt, setChatPrompt] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [reasoningPrompt, setReasoningPrompt] = useState('');
  const [useCustomReasoningPrompt, setUseCustomReasoningPrompt] = useState(false);

  // Performance optimization settings
  const [maxTracesForAnalysis, setMaxTracesForAnalysis] = useState(250);
  const [enableOptimizations, setEnableOptimizations] = useState(true);

  const [traceSearch, setTraceSearch] = useState('');
  const [selectedTraces, setSelectedTraces] = useState<Set<number>>(new Set());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [activeTab, setActiveTab] = useState('traces');

  // Add persistent trace storage
  const [cachedTraces, setCachedTraces] = useState<string[]>([]);

  // Add batch job state
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);

  const queryClient = useQueryClient();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Load saved configuration and restore traces on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('traceDetectiveConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.selectedModel) setSelectedModel(config.selectedModel);
        if (config.reasoningModel) setReasoningModel(config.reasoningModel);
        if (config.customPrompt) setCustomPrompt(config.customPrompt);
        if (config.useCustomPrompt !== undefined) setUseCustomPrompt(config.useCustomPrompt);
        if (config.reasoningPrompt) setReasoningPrompt(config.reasoningPrompt);
        if (config.useCustomReasoningPrompt !== undefined) setUseCustomReasoningPrompt(config.useCustomReasoningPrompt);
        if (config.maxTracesForAnalysis !== undefined) setMaxTracesForAnalysis(config.maxTracesForAnalysis);
        if (config.enableOptimizations !== undefined) setEnableOptimizations(config.enableOptimizations);
      } catch (e) {
        console.error('Failed to load saved configuration:', e);
      }
    }

    // Set default prompts if not already set
    if (!customPrompt) {
      setCustomPrompt(DEFAULT_PROMPTS.analysis);
    }

    if (!reasoningPrompt) {
      setReasoningPrompt(DEFAULT_PROMPTS.reasoning);
    }

    // Restore analysis ID if available (but start with fresh conversation)
    const savedAnalysisId = localStorage.getItem('savedAnalysisId');
    if (savedAnalysisId) {
      const parsedId = parseInt(savedAnalysisId);
      if (!isNaN(parsedId)) {
        setAnalysisId(parsedId);
        console.log('🔄 Restored analysis ID from localStorage:', parsedId);
      }
    }

    // Restore cached traces from localStorage
    const savedTraces = localStorage.getItem('cachedTraces');
    if (savedTraces) {
      try {
        const parsedTraces = JSON.parse(savedTraces);
        if (Array.isArray(parsedTraces)) {
          setCachedTraces(parsedTraces);
          console.log('🔄 Restored cached traces from localStorage:', parsedTraces.length);
        }
      } catch (e) {
        console.error('Failed to restore cached traces:', e);
      }
    }

    // Restore batch jobs from localStorage
    const savedBatchJobs = localStorage.getItem('batchJobs');
    if (savedBatchJobs) {
      try {
        const parsedJobs = JSON.parse(savedBatchJobs);
        if (Array.isArray(parsedJobs)) {
          setBatchJobs(parsedJobs);
          console.log('🔄 Restored batch jobs from localStorage:', parsedJobs.length);
        }
      } catch (e) {
        console.error('Failed to restore batch jobs:', e);
      }
    }
  }, []);

  // Auto-scroll chat to bottom when chat history updates (only if user hasn't scrolled up)
  useEffect(() => {
    if (chatHistory.length > 0 && chatScrollRef.current && !isUserScrolledUp) {
      const scrollContainer = chatScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [chatHistory, isUserScrolledUp]);

  // Check if user has scrolled up and handle auto-scroll behavior
  const handleScrollAreaScroll = useCallback((event: any) => {
    const scrollContainer = event.target;
    if (scrollContainer) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
      
      // If user scrolled up from bottom, stop auto-scroll
      if (!isAtBottom && !isUserScrolledUp) {
        setIsUserScrolledUp(true);
      }
      // If user scrolled back to bottom, resume auto-scroll
      else if (isAtBottom && isUserScrolledUp) {
        setIsUserScrolledUp(false);
      }
    }
  }, [isUserScrolledUp]);

  // Save chat history to localStorage when it changes
  useEffect(() => {
    console.log('🔄 Chat history changed, length:', chatHistory.length);
    if (chatHistory.length > 0) {
      console.log('💾 Saving chat history to localStorage');
      console.log('📝 Latest message:', chatHistory[chatHistory.length - 1]);
      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  // Save batch jobs to localStorage when they change
  useEffect(() => {
    if (batchJobs.length > 0) {
      localStorage.setItem('batchJobs', JSON.stringify(batchJobs));
      console.log('💾 Saving batch jobs to localStorage:', batchJobs.length);
    }
  }, [batchJobs]);

  // Auto-hide confirmation messages after 3 seconds
  useEffect(() => {
    if (saveConfirmation) {
      const timer = setTimeout(() => {
        setSaveConfirmation(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveConfirmation]);

  // Fetch datasets
  const { data: datasets = [], refetch: refetchDatasets } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: async () => {
      const response = await fetch('/api/datasets');
      if (!response.ok) throw new Error('Failed to fetch datasets');
      return response.json();
    }
  });

  // Fetch analysis
  const { data: analysis, error: analysisError } = useQuery<Analysis>({
    queryKey: ['analysis', analysisId],
    queryFn: async () => {
      if (!analysisId) throw new Error('No analysis ID');
      const response = await fetch(`/api/analysis/${analysisId}`);
      if (!response.ok) {
        if (response.status === 404) {
          // Analysis not found - clear the saved ID
          localStorage.removeItem('savedAnalysisId');
          setAnalysisId(null);
          throw new Error('Analysis not found. Server may have restarted - please re-upload your traces.');
        }
        throw new Error('Failed to fetch analysis');
      }
      return response.json();
    },
    enabled: !!analysisId,
    retry: false // Don't retry 404s
  });

  // Upload dataset mutation
  const uploadDatasetMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/datasets', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload dataset');
      }
      return response.json();
    },
    onSuccess: () => {
      refetchDatasets();
    }
  });

  // Delete dataset mutation
  const deleteDatasetMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/datasets/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete dataset');
      return response.json();
    },
    onSuccess: () => {
      refetchDatasets();
    }
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles({ langsmithFile: file });

      // Auto-upload the file
      const formData = new FormData();
      formData.append('langsmithFile', file);

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const result = await response.json();
        setAnalysisId(result.id);
        localStorage.setItem('savedAnalysisId', result.id.toString());
        console.log('💾 Saved traces to localStorage with analysis ID:', result.id);
        setFiles({});
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!analysisId) {
      console.error('❌ No analysis ID available');
      return;
    }
    if (!query.trim()) {
      console.error('❌ No query provided');
      return;
    }
    
    console.log('✅ Starting analysis with valid inputs');

    const controller = new AbortController();
    setAbortController(controller);
    setIsAnalyzing(true);

    // Store the query and clear the input
    const currentQuery = query.trim();
    setQuery('');

    // Add user message to chat history
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: currentQuery,
      timestamp: Date.now()
    };

    setChatHistory(prev => [...prev, userMessage]);

    // We'll add the assistant message only when we get actual content
    let assistantMessage: ChatMessage | null = null;

    try {
      console.log('🚀 Starting analysis request with query:', currentQuery);
      console.log('📊 Analysis ID:', analysisId);
      console.log('🤖 Model:', selectedModel, 'Reasoning:', reasoningModel);
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          analysisId,
          query: currentQuery,
          model: selectedModel,
          reasoningModel: reasoningModel,
          customPrompt: useCustomPrompt ? customPrompt.trim() || undefined : undefined,
          customReasoningPrompt: useCustomReasoningPrompt ? reasoningPrompt.trim() || undefined : undefined,
          chatHistory: chatHistory.length > 0 ? chatHistory : [],
          maxTracesForReasoning: enableOptimizations ? maxTracesForAnalysis : 250,
          enableOptimizations,
          // Always pass cached traces as fallback to ensure they're available after clearing chat
          fallbackTraces: cachedTraces.length > 0 ? cachedTraces : undefined
        }),
        signal: controller.signal
      });

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      let currentResponse = "";
      let currentTracesWithTags: Array<{ trace: string; tags: string[] }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('🔍 Frontend received data:', data.type, data);

              if (data.type === 'heartbeat') {
                console.log('✅ Connection established');
              } else if (data.type === 'content') {
                if (data.content) {
                  currentResponse += data.content;
                  console.log('📝 Content chunk:', data.content);
                  console.log('📝 Total response length:', currentResponse.length);
                  
                  // Create assistant message on first content if it doesn't exist
                  if (!assistantMessage) {
                    assistantMessage = {
                      id: `assistant-${Date.now()}`,
                      type: 'assistant',
                      content: currentResponse,
                      timestamp: Date.now()
                    };
                    setChatHistory(prev => {
                      const newHistory = [...prev, assistantMessage!];
                      console.log('✅ Created new assistant message, chat history length:', newHistory.length);
                      console.log('✅ New message content preview:', assistantMessage!.content.substring(0, 100));
                      return newHistory;
                    });
                    setForceUpdate(prev => prev + 1); // Force re-render
                  } else {
                    // Update existing assistant message
                    setChatHistory(prev => {
                      const updatedHistory = prev.map(msg => 
                        msg.id === assistantMessage!.id 
                          ? { ...msg, content: currentResponse }
                          : msg
                      );
                      console.log('🔄 Updated assistant message, total length:', currentResponse.length);
                      console.log('🔄 Updated message found:', updatedHistory.some(msg => msg.id === assistantMessage!.id));
                      return updatedHistory;
                    });
                    setForceUpdate(prev => prev + 1); // Force re-render
                  }
                } else {
                  console.warn('⚠️ Received empty content chunk');
                }
              } else if (data.type === 'streaming_complete') {
                console.log('✅ Streaming complete');
                setIsAnalyzing(false);
              } else if (data.type === 'reasoning_start') {
                console.log('🧠 Reasoning started');
                setIsSelecting(true);
              } else if (data.type === 'complete') {
                console.log('✅ Analysis complete with traces:', data.tracesWithTags?.length);
                setIsSelecting(false);
                currentTracesWithTags = data.tracesWithTags || [];
                if (assistantMessage) {
                  setChatHistory(prev => prev.map(msg => 
                    msg.id === assistantMessage!.id 
                      ? { ...msg, tracesWithTags: currentTracesWithTags }
                      : msg
                  ));
                }
              } else if (data.type === 'error') {
                console.error('❌ Server error:', data.error);
                throw new Error(data.error);
              }
            } catch (e) {
              console.warn('⚠️ Failed to parse streaming data:', line, e);
            }
          }
        }
      }
      
      // Fallback: If we never got content but completed the stream, create an error message
      if (!assistantMessage && !abortController?.signal.aborted) {
        console.warn('⚠️ No assistant message created, adding fallback');
        const fallbackMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content: "I'm having trouble responding right now. Please try again.",
          timestamp: Date.now()
        };
        setChatHistory(prev => [...prev, fallbackMessage]);
      }
    } catch (error) {
      console.error('💥 Analysis request failed:', error);
      if ((error as any).name === 'AbortError') {
        console.log('Analysis was stopped by user');
        if (assistantMessage) {
          setChatHistory(prev => prev.map(msg => 
            msg.id === assistantMessage!.id 
              ? { ...msg, content: "Analysis was stopped." }
              : msg
          ));
        }
      } else {
        console.error('Analysis error:', error);
        if (assistantMessage) {
          setChatHistory(prev => prev.map(msg => 
            msg.id === assistantMessage!.id 
              ? { ...msg, content: "I encountered an error while analyzing your traces. Please try again." }
              : msg
          ));
        } else {
          // If no assistant message was created yet, create one with the error
          const errorMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            type: 'assistant',
            content: "I encountered an error while analyzing your traces. Please try again.",
            timestamp: Date.now()
          };
          setChatHistory(prev => [...prev, errorMessage]);
        }
      }
    } finally {
      // Always clean up state regardless of how the request ended
      setIsAnalyzing(false);
      setIsSelecting(false);
      setAbortController(null);
    }
  };

  const handleStopAnalysis = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleDatasetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Auto-upload each file separately
    for (const file of files) {
      const formData = new FormData();
      formData.append('datasetFile', file);
      formData.append('name', file.name.replace('.json', ''));

      try {
        await uploadDatasetMutation.mutateAsync(formData);
      } catch (error) {
        console.error('Dataset upload error:', error);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleTraceSelection = (index: number) => {
    const newSelected = new Set(selectedTraces);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTraces(newSelected);
  };

  const handleSelectAllTraces = () => {
    if (selectedTraces.size === filteredTraces.length) {
      setSelectedTraces(new Set());
    } else {
      const allIndices = filteredTraces.map((_, idx) => traces.indexOf(filteredTraces[idx]));
      setSelectedTraces(new Set(allIndices));
    }
  };

  const handleDownloadSelected = () => {
    if (selectedTraces.size === 0) return;

    const selectedTracesContent = Array.from(selectedTraces)
      .map(index => `Line ${index + 1}: ${traces[index]}`)
      .join('\n');

    const blob = new Blob([selectedTracesContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected_traces_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveConfiguration = () => {
    const config = {
      selectedModel,
      reasoningModel,
      customPrompt,
      useCustomPrompt,
      reasoningPrompt,
      useCustomReasoningPrompt,
      maxTracesForAnalysis,
      enableOptimizations
    };
    localStorage.setItem('traceDetectiveConfig', JSON.stringify(config));
    setShowConfigModal(false);
  };

  

  const handleClearChatHistory = () => {
    setChatHistory([]);
    localStorage.removeItem('chatHistory');
    console.log('🔄 Chat history cleared - traces remain available for new questions');
  };

  const handleClearCachedTraces = () => {
    setCachedTraces([]);
    localStorage.removeItem('cachedTraces');
    console.log('🔄 Cached traces cleared');
  };



  const saveConfiguration = () => {
    localStorage.setItem('selectedModel', selectedModel);
    localStorage.setItem('reasoningModel', reasoningModel);
    setShowConfigModal(false);
  };

  // Get traces and filter them - prioritize cached traces over API data
  const traces = useMemo(() => {
    if (cachedTraces.length > 0) {
      console.log('📋 Using cached traces:', cachedTraces.length);
      return cachedTraces;
    }
    
    const apiTraces = analysis?.langsmithContent?.split('\n').filter(line => line.trim() !== '') || [];
    console.log('📋 Using API traces:', apiTraces.length);
    return apiTraces;
  }, [analysis?.langsmithContent, cachedTraces]);

  // Cache traces whenever analysis data changes
  useEffect(() => {
    if (analysis?.langsmithContent) {
      const newTraces = analysis.langsmithContent.split('\n').filter(line => line.trim() !== '');
      if (newTraces.length > 0) {
        setCachedTraces(newTraces);
        localStorage.setItem('cachedTraces', JSON.stringify(newTraces));
        console.log('💾 Cached traces to localStorage:', newTraces.length);
      }
    }
  }, [analysis?.langsmithContent]);

  // Debug logging
  console.log('🔍 Debug traces:', {
    analysisId,
    hasAnalysis: !!analysis,
    langsmithContentLength: analysis?.langsmithContent?.length || 0,
    tracesCount: traces.length,
    analysisObject: analysis ? Object.keys(analysis) : 'no analysis'
  });

  // Log tab changes for debugging
  useEffect(() => {
    console.log('📑 Tab changed to:', activeTab);
    console.log('📊 Current state:', {
      analysisId,
      tracesCount: traces.length,
      cachedTracesCount: cachedTraces.length,
      batchJobsCount: batchJobs.length
    });
  }, [activeTab]);

  // Get the latest assistant message with traces
  const latestAssistantMessage = [...chatHistory].reverse().find(msg => 
    msg.type === 'assistant' && msg.tracesWithTags && msg.tracesWithTags.length > 0
  );

  // Get relevant trace indices and tags from the latest assistant message
  const relevantTraceIndices = new Set(
    latestAssistantMessage?.tracesWithTags?.map(item => {
      const traceIndex = traces.findIndex(t => t === item.trace);
      return traceIndex >= 0 ? traceIndex : null;
    }).filter(index => index !== null) || []
  );

  // Create a map of trace index to tags
  const traceTagsMap = new Map<number, string[]>();
  latestAssistantMessage?.tracesWithTags?.forEach(item => {
    const traceIndex = traces.findIndex(t => t === item.trace);
    if (traceIndex >= 0) {
      traceTagsMap.set(traceIndex, item.tags || []);
    }
  });

  // Sort traces with relevant ones first, then apply search filter
  const sortedTraces = [...traces].sort((a, b) => {
    const aIndex = traces.indexOf(a);
    const bIndex = traces.indexOf(b);
    const aIsRelevant = relevantTraceIndices.has(aIndex);
    const bIsRelevant = relevantTraceIndices.has(bIndex);

    if (aIsRelevant && !bIsRelevant) return -1;
    if (!aIsRelevant && bIsRelevant) return 1;
    return aIndex - bIndex; // Keep original order within each group
  });

  // Normalize text for case and accent insensitive search
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
      .trim();
  };

  const filteredTraces = sortedTraces.filter(trace => 
    normalizeText(trace).includes(normalizeText(traceSearch))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-4">
        {/* Application Title */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1"></div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-100 mb-1">
              Trace Analyst
                </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide mb-1">made with ❤️ by fielddata</p>
            <p className="text-sm text-slate-300">Soft clustering with a reasoning copilot</p>
              </div>
          <div className="flex-1 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfigModal(true)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Settings size={16} className="mr-1" />
              Settings
              </Button>
          </div>
        </div>

        {/* Primary Configuration Panel - Traces */}
        <Card className="bg-slate-900/50 border-slate-700 mb-4 shadow-lg backdrop-blur-sm">
          <CardHeader className="pb-4 border-b border-slate-700/50">
            <CardTitle className="text-slate-100 text-xl flex items-center font-semibold">
              <div className="p-2 bg-slate-800 rounded-lg mr-3">
                <FileText className="text-slate-300" size={20} />
              </div>
              Production Traces
              <span className="text-red-400 ml-2">*</span>
              <span className="text-sm text-slate-400 font-normal ml-2">(Required)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                  <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Upload your production traces file
                </label>
                <Input
                  type="file"
                  accept=".txt,.json,.csv"
                  onChange={handleFileChange}
                  className="bg-slate-800/50 border-slate-600 text-slate-200 h-11 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 transition-all duration-200"
                />
              </div>

              {analysisId && !analysisError && (
                <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                  <p className="text-slate-300 font-medium">
                    ✅ Traces uploaded successfully! | {traces.length} traces loaded
                  </p>
                  <p className="text-slate-400 text-sm mt-1">Analysis ID: {analysisId}</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {cachedTraces.length > 0 ? '📋 Using cached traces (always available)' : '🌐 Using API traces'}
                  </p>
                </div>
              )}
              
              {analysisError && (
                <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
                  <p className="text-red-300 font-medium">
                    ⚠️ Analysis data not found
                  </p>
                  <p className="text-red-400 text-sm mt-1">
                    {analysisError.message}
                  </p>
                  <p className="text-slate-400 text-xs mt-2">
                    Please re-upload your trace file to continue.
                  </p>
                  {cachedTraces.length > 0 && (
                    <div className="mt-2 p-2 bg-slate-800 border border-slate-600 rounded">
                      <p className="text-slate-300 text-xs">
                        📋 {cachedTraces.length} traces available from cache
                      </p>
                      <button 
                        onClick={handleClearCachedTraces}
                        className="text-red-400 hover:text-red-300 text-xs underline mt-1"
                      >
                        Clear cached traces
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary Configuration Panel - Optional Datasets */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-100 text-sm flex items-center">
              <Upload className="mr-2" size={16} />
              Optional Datasets
              <span className="text-xs text-slate-500 font-normal ml-2">(For comparison analysis)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleDatasetFileChange}
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              {datasets.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">
                    {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {datasets.map((dataset) => (
                      <Badge key={dataset.id} variant="secondary" className="bg-slate-800 text-slate-300 border-slate-700 text-xs flex items-center gap-1 pr-1">
                        <span>{dataset.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDatasetMutation.mutate(dataset.id);
                          }}
                          className="h-4 w-4 p-0 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                        >
                          <X size={10} />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </CardContent>
          </Card>

        {/* Main Content Grid */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800 border border-slate-700 rounded-lg mb-6 h-12">
            <TabsTrigger 
              value="traces" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-300 hover:text-slate-200 transition-colors rounded-md h-10"
            >
              <FileText className="w-4 h-4 mr-2" />
              Trace Discovery
            </TabsTrigger>
            <TabsTrigger 
              value="batch-jobs" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-300 hover:text-slate-200 transition-colors rounded-md h-10"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Batch Jobs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="traces" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 220px)' }}>
              {/* Left Panel - Traces */}
                              <Card className="bg-slate-900/50 border-slate-700 flex flex-col shadow-xl backdrop-blur-sm" style={{ height: 'calc(100vh - 220px)' }}>
            <CardHeader className="flex-shrink-0 pb-6 border-b border-slate-700/50">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center space-x-3 text-xl font-semibold">
                    <div className="p-2 bg-slate-800 rounded-lg">
                      <FileText className="text-slate-300" size={20} />
                    </div>
                    <div>
                      <span>Traces</span>
                      <span className="text-slate-400 text-sm font-normal ml-2">({traces.length})</span>
                    </div>
                  </CardTitle>

                  <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-slate-300">Model:</label>
                    <Select value={reasoningModel} onValueChange={setReasoningModel}>
                      <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200 w-36 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        <SelectItem value="o4-mini">o4 Mini</SelectItem>
                        <SelectItem value="o3">o3</SelectItem>
                        <SelectItem value="o3-mini">o3 Mini</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedTraces.size === 0}
                          className="border-slate-600 text-slate-300 hover:bg-slate-800/50 hover:border-slate-500 transition-all duration-200 h-10 px-4"
                        >
                          <Eye size={16} className="mr-2" />
                          Review ({selectedTraces.size})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="text-slate-100">
                            Review Selected Traces ({selectedTraces.size})
                          </DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col space-y-4">
                          <ScrollArea className="max-h-[50vh]">
                            <div className="space-y-3 pr-4">
                              {Array.from(selectedTraces)
                                .sort((a, b) => a - b)
                                .map((traceIndex) => {
                                  const trace = traces[traceIndex];
                                  const traceTags = traceTagsMap.get(traceIndex) || [];
                              return (
                                    <div 
                                      key={traceIndex}
                                      className="p-3 rounded-lg border bg-slate-800/70 border-slate-600"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs text-slate-400 font-mono">Line {traceIndex + 1}</span>
                                        <Button
                                       
                                          size="sm"
                                          onClick={() => handleTraceSelection(traceIndex)}
                                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                        >
                                          <X size={12} />
                                        </Button>
                                      </div>

                                      {traceTags.filter(tag => !tag.includes('selected')).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                              {traceTags.filter(tag => !tag.includes('selected')).map((tag, tagIndex) => (
                                            <Badge 
                                                  key={tagIndex}
                                              variant="secondary" 
                                              className="bg-slate-700 text-slate-300 border-slate-600 text-xs px-1 py-0"
                                                >
                                              {tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </Badge>
                                              ))}
                                            </div>
                                          )}

                                      <p className="text-sm text-slate-300 font-mono break-words">{trace}</p>
                                    </div>
                                  );
                                })}
                            </div>
                          </ScrollArea>

                          <div className="flex justify-between items-center pt-4 border-t border-slate-700">
                            <p className="text-sm text-slate-400">
                              {selectedTraces.size} trace{selectedTraces.size !== 1 ? 's' : ''} selected
                            </p>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                onClick={() => setShowPreviewModal(false)}
                                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  handleDownloadSelected();
                                  setShowPreviewModal(false);
                                }}
                                className="bg-slate-700 text-slate-200 hover:bg-slate-600"
                              >
                                <Download size={16} className="mr-2" />
                                Download Selected
                              </Button>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>




                                </div>

              {/* Configuration Modal */}
              <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-slate-100">Configuration Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    

                    {/* Analysis Prompt Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-200">Analysis Prompt</h3>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Analysis System Prompt
                        </label>
                        <Textarea
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-400 min-h-[200px] font-mono text-sm"
                        />
                        <div className="flex space-x-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUseCustomPrompt(true);
                              setSaveConfirmation('Analysis prompt set for this session');
                            }}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            Use for This Session
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              setUseCustomPrompt(true);
                              const config = JSON.parse(localStorage.getItem('traceDetectiveConfig') || '{}');
                              config.customPrompt = customPrompt;
                              config.useCustomPrompt = true;
                              localStorage.setItem('traceDetectiveConfig', JSON.stringify(config));
                              
                              // Update the code permanently
                              try {
                                await fetch('/api/update-default-prompt', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify({
                                    type: 'analysis',
                                    prompt: customPrompt
                                  })
                                });
                                setSaveConfirmation('Analysis prompt saved permanently in code');
                              } catch (error) {
                                setSaveConfirmation('Analysis prompt saved for this session only');
                              }
                            }}
                            className="border-blue-600 text-blue-400 hover:bg-blue-900/20"
                          >
                            <Save size={14} className="mr-1" />
                            Save for Future Sessions
                          </Button>
                        </div>
                      </div>
                                      </div>

                    {/* Reasoning Prompt Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-200">Reasoning Prompt</h3>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Reasoning System Prompt
                        </label>
                        <Textarea
                          value={reasoningPrompt}
                          onChange={(e) => setReasoningPrompt(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-400 min-h-[200px] font-mono text-sm"
                        />
                        <div className="flex space-x-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUseCustomReasoningPrompt(true);
                              setSaveConfirmation('Reasoning prompt set for this session');
                            }}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            Use for This Session
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              setUseCustomReasoningPrompt(true);
                              const config = JSON.parse(localStorage.getItem('traceDetectiveConfig') || '{}');
                              config.reasoningPrompt = reasoningPrompt;
                              config.useCustomReasoningPrompt = true;
                              localStorage.setItem('traceDetectiveConfig', JSON.stringify(config));
                              
                              // Update the code permanently
                              try {
                                await fetch('/api/update-default-prompt', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify({
                                    type: 'reasoning',
                                    prompt: reasoningPrompt
                                  })
                                });
                                setSaveConfirmation('Reasoning prompt saved permanently in code');
                              } catch (error) {
                                setSaveConfirmation('Reasoning prompt saved for this session only');
                              }
                            }}
                            className="border-blue-600 text-blue-400 hover:bg-blue-900/20"
                          >
                            <Save size={14} className="mr-1" />
                            Save for Future Sessions
                          </Button>
                                      </div>
                                    </div>
                                  </div>

                                         {/* Performance Optimization Settings */}
                     <div className="space-y-4">
                       <h3 className="text-lg font-semibold text-slate-200">Performance Optimization</h3>
                       <div className="flex items-center space-x-2">
                         <Checkbox
                           id="enableOptimizations"
                           checked={enableOptimizations}
                           onCheckedChange={(checked) => setEnableOptimizations(!!checked)}
                           className="text-slate-300"
                         />
                         <label htmlFor="enableOptimizations" className="text-sm text-slate-300">
                           Enable optimizations (reduces traces for both chat and reasoning models)
                         </label>
                       </div>
                       {enableOptimizations && (
                         <div className="grid grid-cols-2 gap-2">
                           <div className="flex items-center space-x-2">
                             <label htmlFor="maxTracesForAnalysis" className="text-sm text-slate-300">Max Traces (Both Models):</label>
                             <Input
                               type="number"
                               id="maxTracesForAnalysis"
                               value={maxTracesForAnalysis}
                               onChange={(e) => setMaxTracesForAnalysis(Number(e.target.value))}
                               className="bg-slate-800 border-slate-700 text-slate-200 w-24"
                             />
                           </div>
                         </div>
                       )}
                     </div>

                    {/* Confirmation Message */}
                    {saveConfirmation && (
                      <div className="flex items-center space-x-2 p-3 bg-green-900/20 border border-green-600 rounded-lg">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-green-400 text-sm">{saveConfirmation}</span>
                      </div>
                    )}

                    {/* Close Button */}
                    <div className="flex justify-end space-x-2 pt-4 border-t border-slate-700">
                      <Button
                        variant="outline"
                        onClick={() => setShowConfigModal(false)}
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="relative mt-6">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  placeholder="Search traces..."
                  value={traceSearch}
                  onChange={(e) => setTraceSearch(e.target.value)}
                  className="pl-12 pr-12 h-12 bg-slate-800/50 border-slate-600 text-slate-200 placeholder-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 transition-all duration-200 text-sm"
                />
                {traceSearch && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTraceSearch('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-full transition-all duration-200"
                  >
                    <X size={16} />
                  </Button>
                                )}
                              </div>

              {isSelecting && (
                <div className="flex items-center justify-center space-x-2 bg-slate-800/30 rounded-md px-3 py-2 mt-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-blue-300 text-xs font-medium">Selecting traces...</span>
                </div>
              )}
              
              <div className="mt-4"></div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-3">
              <ScrollArea style={{ height: 'calc(100vh - 390px)' }}>
                {filteredTraces.length > 0 ? (
                  <div className="space-y-3">
                    {filteredTraces.map((trace, index) => {
                      const originalIndex = traces.indexOf(trace);
                      const isSelected = selectedTraces.has(originalIndex);
                      const isRelevant = relevantTraceIndices.has(originalIndex);
                      const traceTags = traceTagsMap.get(originalIndex) || [];

                      return (
                        <div 
                          key={index} 
                          className={`group relative overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
                            isSelected 
                              ? 'bg-slate-800/80 border-slate-500 shadow-md ring-1 ring-slate-400/30' 
                              : isRelevant 
                                ? 'bg-green-900/20 border-green-500/50 shadow-md hover:bg-green-900/30 hover:border-green-400/60' 
                                : 'bg-slate-800/40 border-slate-600/40 hover:border-slate-500/60 hover:bg-slate-800/60 hover:shadow-sm'
                          }`}
                          onClick={() => handleTraceSelection(originalIndex)}
                        >
                          <div className="p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Star 
                                  size={16}
                                  className={`cursor-pointer transition-all duration-200 ${
                                    isSelected 
                                      ? 'text-yellow-400 fill-yellow-400' 
                                      : 'text-slate-500 hover:text-yellow-300 group-hover:text-slate-400'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTraceSelection(originalIndex);
                                  }}
                                />
                                <div className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all duration-200 ${
                                  isSelected 
                                    ? 'bg-slate-600/80 text-slate-200' 
                                    : 'bg-slate-700/60 text-slate-300 group-hover:bg-slate-600/70'
                                }`}>
                                  #{originalIndex + 1}
                                </div>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                {traceTags.filter(tag => !tag.includes('selected')).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {traceTags.filter(tag => !tag.includes('selected')).map((tag, tagIndex) => (
                                      <Badge 
                                        key={tagIndex}
                                        variant="secondary" 
                                        className="bg-slate-600/50 text-slate-300 border-slate-500/50 text-xs px-2 py-0.5 rounded-full font-medium"
                                      >
                                        {tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                <p className="text-sm text-slate-100 font-mono leading-relaxed break-words">
                                  {trace}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                                ) : traceSearch ? (
                  <div className="text-center py-12">
                    <Search className="mx-auto mb-4 text-slate-500" size={48} />
                    <p className="text-slate-400 text-lg">No traces found matching "{traceSearch}"</p>
                    <p className="text-slate-500 text-sm mt-2">Try adjusting your search terms</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="mx-auto mb-4 text-slate-500" size={48} />
                    <p className="text-slate-400 text-lg">Upload a trace file to see traces here</p>
                    <p className="text-slate-500 text-sm mt-2">Supported formats: .txt, .json, .csv</p>
                  </div>
                )}
              </ScrollArea>
                </CardContent>
              </Card>

          {/* Right Panel - Chat */}
                      <Card className="bg-slate-900/50 border-slate-700 flex flex-col shadow-xl backdrop-blur-sm" style={{ height: 'calc(100vh - 220px)' }}>
            <CardHeader className="flex-shrink-0 pb-6 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                <CardTitle className="text-slate-100 flex items-center space-x-3 text-xl font-semibold">
                  <div className="p-2 bg-slate-800 rounded-lg">
                    <MessageCircle className="text-slate-300" size={20} />
                  </div>
                  <span>AI Analysis Chat</span>
                </CardTitle>

                    <div className="flex items-center space-x-4">
                  <label className="text-sm font-medium text-slate-300">Model:</label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200 w-36 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="o4-mini">o4 Mini</SelectItem>
                      <SelectItem value="o3">o3</SelectItem>
                      <SelectItem value="o3-mini">o3 Mini</SelectItem>
                    </SelectContent>
                  </Select>
                    </div>
                  </div>
                </CardHeader>

            <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
              {!analysisId ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-slate-400">Please upload trace files first</p>
                          </div>
              ) : (
                <>
                  {/* Chat Messages Area */}
                  <div className="flex-1 overflow-hidden mb-4 relative">
                    <ScrollArea 
                      ref={chatScrollRef} 
                      style={{ height: 'calc(100vh - 390px)' }}
                      onScrollCapture={handleScrollAreaScroll}
                    >
                      {chatHistory.length > 0 ? (
                        <div className="space-y-4 pb-20 pr-4 pl-2">
                          {chatHistory.map((message) => {
                            return (
                            <div key={message.id} className={`p-4 rounded-xl mr-2 border transition-all duration-200 ${
                              message.type === 'user' 
                                ? 'bg-slate-700/30 border-slate-600/50 ml-8' 
                                : 'bg-slate-800/50 border-slate-700/50 mr-8'
                            }`}>

                              {message.type === 'user' ? (
                                <p className="text-slate-300">{message.content}</p>
                                                            ) : (
                                <div 
                                  className="text-slate-300 leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none break-words overflow-wrap-anywhere overflow-visible"
                                  style={{ 
                                    minHeight: 'auto', 
                                    height: 'auto', 
                                    wordWrap: 'break-word', 
                                    overflowWrap: 'break-word',
                                    marginRight: '8px',
                                    paddingRight: '8px'
                                  }}
                                  dangerouslySetInnerHTML={{
                                    __html: message.content
                                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
                                      .replace(/`([^`]+)`/g, '<code class="bg-slate-700 px-1 py-0.5 rounded text-sm">$1</code>')
                                      .replace(/###\s(.+)/g, '<h3 class="text-lg font-semibold text-slate-100 mt-4 mb-2">$1</h3>')
                                      .replace(/^- (.+)$/gm, '<div class="flex items-start space-x-2 my-2"><span class="text-slate-400 mt-1">•</span><span class="break-words">$1</span></div>')
                                  }}
                                />
                        )}
                            </div>
                          );
                          })}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center">
                            <MessageCircle className="mx-auto mb-4 text-slate-500" size={64} />
                            <p className="text-slate-400 text-lg">Ask a question about your traces to start analyzing</p>
                            <p className="text-slate-500 text-sm mt-2">I'll help you understand patterns and insights in your data</p>
                        </div>
                      </div>
                    )}
                    </ScrollArea>
                    
                    {/* Auto-scroll paused indicator */}
                    {isUserScrolledUp && (
                      <div className="absolute bottom-4 right-4 bg-blue-600/90 backdrop-blur-sm text-white px-4 py-3 rounded-xl shadow-lg text-sm flex items-center space-x-2 z-10 border border-blue-500/30">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <span>Auto-scroll paused • Scroll down to resume</span>
                      </div>
                    )}
                  </div>

                  {/* Chat Input Area */}
                  <div className="flex-shrink-0 border-t border-slate-700/50 pt-4">
                    <div className="flex gap-3">
                      <Textarea
                        placeholder="Ask about your traces..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (query.trim() && !isAnalyzing) {
                              handleAnalyze();
                            }
                          }
                        }}
                        className="bg-slate-800/50 border-slate-600 text-slate-200 placeholder-slate-400 resize-none flex-1 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 transition-all duration-200"
                        rows={2}
                        disabled={!analysisId || isAnalyzing}
                        />
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearChatHistory}
                          disabled={chatHistory.length === 0}
                          className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:border-red-600 hover:text-red-400 transition-all duration-200"
                        >
                          <X size={16} className="mr-1" />
                          Clear
                        </Button>
                      </div>
                    </div>

                    
                  </div>
                </>
              )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="batch-jobs" className="mt-0">
            <div style={{ height: 'calc(100vh - 220px)' }}>
              <BatchJobManager
                traces={traces}
                analysisId={analysisId}
                onClose={() => setActiveTab('traces')}
                batchJobs={batchJobs}
                setBatchJobs={setBatchJobs}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
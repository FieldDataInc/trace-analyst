import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Search, Filter, Download, RefreshCw, Play, Loader2 } from 'lucide-react';

interface BatchJobViewProps {
  traces: string[];
  analysisId: number | null;
  onClose: () => void;
}

interface BatchJobResult {
  trace: string;
  originalIndex: number;
  relevanceScore: number;
  reasoning: string;
}

export default function BatchJobView({ traces, analysisId, onClose }: BatchJobViewProps) {
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BatchJobResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Filter results based on search term
  const filteredResults = results.filter(result =>
    result.trace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.reasoning.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRunBatchJob = async () => {
    if (!query.trim() || !analysisId) return;

    setIsProcessing(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch('/api/batch-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisId,
          query: query.trim(),
          maxResults,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run batch job');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    const content = filteredResults
      .map((result, index) => `${index + 1}. [Line ${result.originalIndex + 1}] (Score: ${result.relevanceScore})\n${result.trace}\n\nReasoning: ${result.reasoning}\n`)
      .join('\n' + '='.repeat(80) + '\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_job_${query.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setResults([]);
    setError(null);
    setSearchTerm('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="bg-slate-900 border-slate-800 w-full max-w-7xl h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100 flex items-center space-x-2">
              <Filter className="w-5 h-5" />
              <span>Batch Job Analysis</span>
              {results.length > 0 && (
                <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                  {filteredResults.length} of {results.length} results
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
            {/* Query Controls */}
            <div className="lg:col-span-1 space-y-4">
              <div>
                <Label htmlFor="query" className="text-slate-200 font-medium">
                  Query Description
                </Label>
                <Textarea
                  id="query"
                  placeholder="Describe what you're looking for... e.g., 'traces where users sent more than one data point in the same text'"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="mt-2 bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-400 min-h-[100px]"
                />
              </div>

              <div>
                <Label htmlFor="maxResults" className="text-slate-200 font-medium">
                  Max Results
                </Label>
                <Input
                  id="maxResults"
                  type="number"
                  min="1"
                  max="100"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Math.max(1, parseInt(e.target.value) || 30))}
                  className="mt-2 bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="flex flex-col space-y-2">
                <Button
                  onClick={handleRunBatchJob}
                  disabled={!query.trim() || isProcessing || !analysisId}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Batch Job
                    </>
                  )}
                </Button>

                {results.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearResults}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Clear Results
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Results
                    </Button>
                  </>
                )}
              </div>

              {results.length > 0 && (
                <div>
                  <Label htmlFor="search" className="text-slate-200 font-medium">
                    Search Results
                  </Label>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      id="search"
                      placeholder="Search in results..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-400"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-600 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Results Display */}
            <div className="lg:col-span-3 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-200 font-medium">
                  {results.length > 0 ? `Results (${filteredResults.length})` : 'No Results'}
                </h3>
                {results.length > 0 && (
                  <div className="text-sm text-slate-400">
                    Total traces analyzed: {traces.length}
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1 border border-slate-700 rounded-lg bg-slate-800/50">
                {filteredResults.length > 0 ? (
                  <div className="p-4 space-y-4">
                    {filteredResults.map((result, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-slate-400 font-mono">
                              Line {result.originalIndex + 1}
                            </span>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${
                                result.relevanceScore >= 0.8 
                                  ? 'bg-green-600 text-white' 
                                  : result.relevanceScore >= 0.6 
                                    ? 'bg-yellow-600 text-white' 
                                    : 'bg-slate-600 text-slate-300'
                              }`}
                            >
                              Score: {result.relevanceScore.toFixed(2)}
                            </Badge>
                          </div>
                          <span className="text-xs text-slate-400">
                            Result #{index + 1}
                          </span>
                        </div>
                        
                        <div className="mb-3">
                          <p className="text-sm text-slate-300 font-mono break-words">
                            {result.trace}
                          </p>
                        </div>
                        
                        <div className="pt-2 border-t border-slate-700">
                          <p className="text-xs text-slate-400 font-medium mb-1">AI Reasoning:</p>
                          <p className="text-xs text-slate-400 italic">
                            {result.reasoning}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : isProcessing ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 text-slate-600 mx-auto mb-4 animate-spin" />
                      <p className="text-slate-400">Analyzing traces...</p>
                      <p className="text-slate-500 text-sm mt-1">
                        This may take a moment
                      </p>
                    </div>
                  </div>
                ) : results.length === 0 && !error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Filter className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">Enter a query and click "Run Batch Job" to start</p>
                      <p className="text-slate-500 text-sm mt-1">
                        AI will analyze your traces and find relevant examples
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">No results match your search</p>
                      <p className="text-slate-500 text-sm mt-1">
                        Try adjusting your search terms
                      </p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 
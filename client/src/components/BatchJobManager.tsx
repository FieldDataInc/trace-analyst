import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, Filter, Download, RefreshCw, Play, Loader2, Plus, 
  Trash2, Edit3, Save, X, PlayCircle, PauseCircle, Settings, Eye, FileDown 
} from 'lucide-react';

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

interface BatchJobManagerProps {
  traces: string[];
  analysisId: number | null;
  onClose: () => void;
  batchJobs: BatchJob[];
  setBatchJobs: React.Dispatch<React.SetStateAction<BatchJob[]>>;
}

const AVAILABLE_MODELS = [
  { value: 'o4-mini', label: 'o4 Mini' },
  { value: 'o3', label: 'o3' },
  { value: 'o3-mini', label: 'o3 Mini' }
];

export default function BatchJobManager({ traces, analysisId, onClose, batchJobs, setBatchJobs }: BatchJobManagerProps) {
  // Use parent state instead of local state
  const jobs = batchJobs;
  const setJobs = setBatchJobs;
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJob, setEditingJob] = useState<BatchJob | null>(null);
  const [viewingResults, setViewingResults] = useState<BatchJob | null>(null);

  // New job form state
  const [newJobName, setNewJobName] = useState('');
  const [newJobQuery, setNewJobQuery] = useState('');
  const [newJobModel, setNewJobModel] = useState('o4-mini');
  const [newJobMaxResults, setNewJobMaxResults] = useState(20);

  // No need to load or save jobs here - handled by parent component

  const loadSavedJobs = async () => {
    try {
      // Load from localStorage first
      const savedJobs = localStorage.getItem('batchJobs');
      if (savedJobs) {
        setJobs(JSON.parse(savedJobs));
      }

      // Load from server if analysisId is available
      if (analysisId) {
        const response = await fetch(`/api/batch-jobs/${analysisId}`);
        if (response.ok) {
          const serverJobs = await response.json();
          setJobs(serverJobs);
        }
      }
    } catch (error) {
      console.error('Failed to load saved jobs:', error);
    }
  };

  const saveJobsToServer = async () => {
    if (!analysisId) return;

    try {
      await fetch('/api/batch-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          jobs: jobs.map(job => ({
            id: job.id,
            name: job.name,
            query: job.query,
            model: job.model,
            maxResults: job.maxResults,
            createdAt: job.createdAt
          }))
        })
      });
    } catch (error) {
      console.error('Failed to save jobs to server:', error);
    }
  };

  const createJob = () => {
    if (!newJobName.trim() || !newJobQuery.trim()) return;

    const newJob: BatchJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newJobName.trim(),
      query: newJobQuery.trim(),
      model: newJobModel,
      maxResults: newJobMaxResults,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    setJobs(prev => [...prev, newJob]);
    setNewJobName('');
    setNewJobQuery('');
    setNewJobModel('o4-mini');
    setNewJobMaxResults(20);
    setShowCreateModal(false);
    saveJobsToServer();
  };

  const updateJob = (updatedJob: BatchJob) => {
    setJobs(prev => prev.map(job => job.id === updatedJob.id ? updatedJob : job));
    setEditingJob(null);
    saveJobsToServer();
  };

  const deleteJob = (jobId: string) => {
    setJobs(prev => prev.filter(job => job.id !== jobId));
    setSelectedJobs(prev => {
      const newSet = new Set(prev);
      newSet.delete(jobId);
      return newSet;
    });
    saveJobsToServer();
  };

  const runSingleJob = async (job: BatchJob) => {
    if (!analysisId) return;

    setJobs(prev => prev.map(j => 
      j.id === job.id ? { ...j, status: 'running', error: undefined } : j
    ));

    try {
      const response = await fetch('/api/batch-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          query: job.query,
          model: job.model,
          maxResults: job.maxResults,
          fallbackTraces: traces.length > 0 ? traces : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run batch job');
      }

      const data = await response.json();
      
      setJobs(prev => prev.map(j => 
        j.id === job.id ? { 
          ...j, 
          status: 'completed', 
          results: data.results,
          lastRunAt: new Date().toISOString()
        } : j
      ));
    } catch (error) {
      setJobs(prev => prev.map(j => 
        j.id === job.id ? { 
          ...j, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error'
        } : j
      ));
    }
  };

  const runAllJobs = async () => {
    const jobsToRun = jobs.filter(job => selectedJobs.has(job.id));
    if (jobsToRun.length === 0) return;

    setIsRunningAll(true);

    // Run all jobs in parallel
    const promises = jobsToRun.map(job => runSingleJob(job));
    
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Error running batch jobs:', error);
    } finally {
      setIsRunningAll(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const selectAllJobs = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(job => job.id)));
    }
  };

  const exportResults = () => {
    const completedJobs = jobs.filter(job => job.status === 'completed' && job.results);
    
    const content = completedJobs.map(job => {
      const results = job.results || [];
      return `
========================================
JOB: ${job.name}
QUERY: ${job.query}
MODEL: ${job.model}
RUN DATE: ${job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'N/A'}
RESULTS: ${results.length}
========================================

${results.map((result, index) => `
${index + 1}. [Line ${result.originalIndex + 1}] (Score: ${result.relevanceScore.toFixed(2)})
${result.trace}

Reasoning: ${result.reasoning}
`).join('\n' + '-'.repeat(40) + '\n')}
`;
    }).join('\n' + '='.repeat(80) + '\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_jobs_export_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJobResults = (job: BatchJob) => {
    if (!job.results || job.results.length === 0) return;

    const results = job.results;
    const content = `
========================================
JOB: ${job.name}
QUERY: ${job.query}
MODEL: ${job.model}
RUN DATE: ${job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'N/A'}
RESULTS: ${results.length}
========================================

${results.map((result, index) => `
${index + 1}. [Line ${result.originalIndex + 1}] (Score: ${result.relevanceScore.toFixed(2)})
${result.trace}

Reasoning: ${result.reasoning}
`).join('\n' + '-'.repeat(40) + '\n')}

========================================
Export generated on: ${new Date().toLocaleString()}
========================================
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name.replace(/[^a-zA-Z0-9]/g, '_')}_results_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.query.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const completedJobsCount = jobs.filter(job => job.status === 'completed').length;
  const runningJobsCount = jobs.filter(job => job.status === 'running').length;

  return (
    <Card className="bg-slate-900 border-slate-800 w-full h-full flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100 flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Batch Job Manager</span>
              <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                {jobs.length} jobs
              </Badge>
              {completedJobsCount > 0 && (
                <Badge variant="secondary" className="bg-green-600 text-white">
                  {completedJobsCount} completed
                </Badge>
              )}
              {runningJobsCount > 0 && (
                <Badge variant="secondary" className="bg-blue-600 text-white">
                  {runningJobsCount} running
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Back to Traces
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-6">
          <div className="flex flex-col h-full space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="w-4 h-4 mr-2" />
                      New Job
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                      <DialogTitle className="text-slate-100">Create New Batch Job</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="jobName" className="text-slate-200">Job Name</Label>
                        <Input
                          id="jobName"
                          value={newJobName}
                          onChange={(e) => setNewJobName(e.target.value)}
                          placeholder="e.g., Multiple Data Points"
                          className="bg-slate-800 border-slate-700 text-slate-200"
                        />
                      </div>
                      <div>
                        <Label htmlFor="jobQuery" className="text-slate-200">Query</Label>
                        <Textarea
                          id="jobQuery"
                          value={newJobQuery}
                          onChange={(e) => setNewJobQuery(e.target.value)}
                          placeholder="Describe what you're looking for..."
                          className="bg-slate-800 border-slate-700 text-slate-200 min-h-[100px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="jobModel" className="text-slate-200">Model</Label>
                          <Select value={newJobModel} onValueChange={setNewJobModel}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {AVAILABLE_MODELS.map(model => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="jobMaxResults" className="text-slate-200">Max Results</Label>
                          <Input
                            id="jobMaxResults"
                            type="number"
                            min="1"
                            max="100"
                            value={newJobMaxResults}
                            onChange={(e) => setNewJobMaxResults(Math.max(1, parseInt(e.target.value) || 30))}
                            className="bg-slate-800 border-slate-700 text-slate-200"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowCreateModal(false)}
                          className="border-slate-700 text-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={createJob}
                          disabled={!newJobName.trim() || !newJobQuery.trim()}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Create Job
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  onClick={selectAllJobs}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  {selectedJobs.size === jobs.length ? 'Deselect All' : 'Select All'}
                </Button>

                <Button
                  onClick={runAllJobs}
                  disabled={selectedJobs.size === 0 || isRunningAll || !analysisId}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isRunningAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running {selectedJobs.size} jobs...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Run Selected ({selectedJobs.size})
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    placeholder="Search jobs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-400 w-64"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={exportResults}
                  disabled={completedJobsCount === 0}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Results
                </Button>
              </div>
            </div>

            {/* No Analysis Warning */}
            {!analysisId && (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 text-yellow-400">
                  <div className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                    <span className="text-yellow-900 text-xs font-bold">!</span>
                  </div>
                  <p className="text-sm font-medium">No trace data available</p>
                </div>
                <p className="text-yellow-300/80 text-sm mt-2">
                  To run batch jobs, you need to first upload a trace file in the "Trace Discovery" tab. 
                  Jobs will remain in "pending" status until trace data is available.
                </p>
              </div>
            )}

            {/* Jobs List */}
            <ScrollArea className="flex-1 border border-slate-700 rounded-lg bg-slate-800/50">
              {filteredJobs.length > 0 ? (
                <div className="p-4 space-y-3">
                  {filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        selectedJobs.has(job.id)
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-slate-700 bg-slate-800/70 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedJobs.has(job.id)}
                            onChange={() => toggleJobSelection(job.id)}
                            className="mt-1 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="text-slate-200 font-medium">{job.name}</h3>
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  job.status === 'completed' ? 'bg-green-600 text-white' :
                                  job.status === 'running' ? 'bg-blue-600 text-white' :
                                  job.status === 'error' ? 'bg-red-600 text-white' :
                                  'bg-slate-600 text-slate-300'
                                }`}
                              >
                                {job.status}
                              </Badge>
                              <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                                {job.model}
                              </Badge>
                              {job.results && (
                                <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                                  {job.results.length} results
                                </Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-sm mb-2">{job.query}</p>
                            {job.error && (
                              <p className="text-red-400 text-sm">{job.error}</p>
                            )}
                            <div className="flex items-center space-x-4 text-xs text-slate-500">
                              <span>Max: {job.maxResults}</span>
                              <span>Created: {new Date(job.createdAt).toLocaleDateString()}</span>
                              {job.lastRunAt && (
                                <span>Last run: {new Date(job.lastRunAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => runSingleJob(job)}
                            disabled={job.status === 'running' || !analysisId}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            {job.status === 'running' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          {job.status === 'completed' && job.results && job.results.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingResults(job)}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingJob(job)}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteJob(job.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Settings className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No batch jobs found</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Create your first batch job to get started
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </CardContent>

        {/* Edit Job Modal */}
        {editingJob && (
          <Dialog open={!!editingJob} onOpenChange={() => setEditingJob(null)}>
            <DialogContent className="bg-slate-900 border-slate-800">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Edit Batch Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="editJobName" className="text-slate-200">Job Name</Label>
                  <Input
                    id="editJobName"
                    value={editingJob.name}
                    onChange={(e) => setEditingJob({...editingJob, name: e.target.value})}
                    className="bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>
                <div>
                  <Label htmlFor="editJobQuery" className="text-slate-200">Query</Label>
                  <Textarea
                    id="editJobQuery"
                    value={editingJob.query}
                    onChange={(e) => setEditingJob({...editingJob, query: e.target.value})}
                    className="bg-slate-800 border-slate-700 text-slate-200 min-h-[100px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="editJobModel" className="text-slate-200">Model</Label>
                    <Select 
                      value={editingJob.model} 
                      onValueChange={(value) => setEditingJob({...editingJob, model: value})}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {AVAILABLE_MODELS.map(model => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="editJobMaxResults" className="text-slate-200">Max Results</Label>
                    <Input
                      id="editJobMaxResults"
                      type="number"
                      min="1"
                      max="100"
                      value={editingJob.maxResults}
                      onChange={(e) => setEditingJob({...editingJob, maxResults: Math.max(1, parseInt(e.target.value) || 30)})}
                      className="bg-slate-800 border-slate-700 text-slate-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditingJob(null)}
                    className="border-slate-700 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => updateJob(editingJob)}
                    disabled={!editingJob.name.trim() || !editingJob.query.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Update Job
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* View Results Modal */}
        {viewingResults && (
          <Dialog open={!!viewingResults} onOpenChange={() => setViewingResults(null)}>
            <DialogContent className="bg-slate-900 border-slate-800 max-w-6xl max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle className="text-slate-100 flex items-center space-x-2">
                  <Eye className="w-5 h-5" />
                  <span>Results: {viewingResults.name}</span>
                  <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                    {viewingResults.results?.length || 0} traces found
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-slate-300 text-sm">
                  <p><strong>Query:</strong> {viewingResults.query}</p>
                  <p><strong>Model:</strong> {viewingResults.model}</p>
                  <p><strong>Run Date:</strong> {viewingResults.lastRunAt ? new Date(viewingResults.lastRunAt).toLocaleString() : 'N/A'}</p>
                </div>
                
                <ScrollArea className="h-96 border border-slate-700 rounded-lg bg-slate-800/50 p-4">
                  <div className="space-y-4">
                    {viewingResults.results?.map((result, index) => (
                      <div key={index} className="border border-slate-700 rounded-lg p-4 bg-slate-800/70">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="secondary" className="bg-blue-600 text-white text-xs">
                              Line {result.originalIndex + 1}
                            </Badge>
                            <Badge variant="secondary" className="bg-green-600 text-white text-xs">
                              Score: {result.relevanceScore.toFixed(2)}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="mb-3">
                          <h4 className="text-slate-200 font-medium mb-1">Trace:</h4>
                          <div className="bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm font-mono overflow-x-auto">
                            {result.trace}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-slate-200 font-medium mb-1">AI Reasoning:</h4>
                          <div className="bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm">
                            {result.reasoning}
                          </div>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center text-slate-400 py-8">
                        No results to display
                      </div>
                    )}
                  </div>
                </ScrollArea>
                
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => downloadJobResults(viewingResults)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Download Results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setViewingResults(null)}
                    className="border-slate-700 text-slate-300"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </Card>
    );
} 
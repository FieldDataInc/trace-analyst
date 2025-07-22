import { users, analysisResults, datasets, batchJobs, type User, type InsertUser, type AnalysisResult, type InsertAnalysisResult, type Dataset, type InsertDataset } from "@shared/schema";

export interface BatchJob {
  id: number;
  analysisId: number;
  jobId: string;
  name: string;
  query: string;
  model: string;
  maxResults: number;
  status: string;
  results?: any;
  error?: string;
  createdAt: Date;
  lastRunAt?: Date;
}

export interface InsertBatchJob {
  analysisId: number;
  jobId: string;
  name: string;
  query: string;
  model: string;
  maxResults: number;
  status?: string;
  results?: any;
  error?: string;
  lastRunAt?: Date;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createAnalysis(analysis: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysis(id: number): Promise<AnalysisResult | undefined>;
  createDataset(dataset: InsertDataset): Promise<Dataset>;
  getDataset(id: number): Promise<Dataset | undefined>;
  getAllDatasets(): Promise<Dataset[]>;
  deleteDataset(id: number): Promise<boolean>;
  createBatchJob(job: InsertBatchJob): Promise<BatchJob>;
  getBatchJob(id: number): Promise<BatchJob | undefined>;
  getBatchJobsByAnalysis(analysisId: number): Promise<BatchJob[]>;
  updateBatchJob(id: number, updates: Partial<InsertBatchJob>): Promise<BatchJob | undefined>;
  deleteBatchJob(id: number): Promise<boolean>;
  saveBatchJobs(analysisId: number, jobs: Array<Omit<InsertBatchJob, 'analysisId'>>): Promise<BatchJob[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private analyses: Map<number, AnalysisResult>;
  private datasets: Map<number, Dataset>;
  private batchJobs: Map<number, BatchJob>;
  private currentUserId: number;
  private currentAnalysisId: number;
  private currentDatasetId: number;
  private currentBatchJobId: number;

  constructor() {
    this.users = new Map();
    this.analyses = new Map();
    this.datasets = new Map();
    this.batchJobs = new Map();
    this.currentUserId = 1;
    this.currentAnalysisId = 1;
    this.currentDatasetId = 1;
    this.currentBatchJobId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createAnalysis(insertAnalysis: InsertAnalysisResult): Promise<AnalysisResult> {
    const id = this.currentAnalysisId++;
    const analysis: AnalysisResult = { 
      ...insertAnalysis, 
      id,
      createdAt: new Date()
    };
    this.analyses.set(id, analysis);
    return analysis;
  }

  async getAnalysis(id: number): Promise<AnalysisResult | undefined> {
    return this.analyses.get(id);
  }

  async createDataset(insertDataset: InsertDataset): Promise<Dataset> {
    const id = this.currentDatasetId++;
    const dataset: Dataset = {
      ...insertDataset,
      id,
      createdAt: new Date()
    };
    this.datasets.set(id, dataset);
    return dataset;
  }

  async getDataset(id: number): Promise<Dataset | undefined> {
    return this.datasets.get(id);
  }

  async getAllDatasets(): Promise<Dataset[]> {
    return Array.from(this.datasets.values());
  }

  async deleteDataset(id: number): Promise<boolean> {
    return this.datasets.delete(id);
  }

  async createBatchJob(insertJob: InsertBatchJob): Promise<BatchJob> {
    const job: BatchJob = {
      id: this.currentBatchJobId++,
      ...insertJob,
      createdAt: new Date(),
    };
    this.batchJobs.set(job.id, job);
    return job;
  }

  async getBatchJob(id: number): Promise<BatchJob | undefined> {
    return this.batchJobs.get(id);
  }

  async getBatchJobsByAnalysis(analysisId: number): Promise<BatchJob[]> {
    return Array.from(this.batchJobs.values()).filter(job => job.analysisId === analysisId);
  }

  async updateBatchJob(id: number, updates: Partial<InsertBatchJob>): Promise<BatchJob | undefined> {
    const job = this.batchJobs.get(id);
    if (!job) return undefined;

    const updatedJob = { ...job, ...updates };
    this.batchJobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteBatchJob(id: number): Promise<boolean> {
    return this.batchJobs.delete(id);
  }

  async saveBatchJobs(analysisId: number, jobs: Array<Omit<InsertBatchJob, 'analysisId'>>): Promise<BatchJob[]> {
    // Delete existing jobs for this analysis
    const existingJobs = Array.from(this.batchJobs.values()).filter(job => job.analysisId === analysisId);
    existingJobs.forEach(job => this.batchJobs.delete(job.id));

    // Create new jobs
    const newJobs: BatchJob[] = [];
    for (const jobData of jobs) {
      const job = await this.createBatchJob({ ...jobData, analysisId });
      newJobs.push(job);
    }

    return newJobs;
  }
}

export const storage = new MemStorage();
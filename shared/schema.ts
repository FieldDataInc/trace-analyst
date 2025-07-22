import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  langsmithContent: text("langsmith_content").notNull(),
  datasetFiles: jsonb("dataset_files").notNull(),
  analysisData: jsonb("analysis_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const batchJobs = pgTable("batch_jobs", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").references(() => analysisResults.id, { onDelete: "cascade" }).notNull(),
  jobId: text("job_id").notNull(), // Client-side generated ID
  name: text("name").notNull(),
  query: text("query").notNull(),
  model: text("model").notNull(),
  maxResults: integer("max_results").notNull().default(30),
  status: text("status").notNull().default("pending"), // pending, running, completed, error
  results: jsonb("results"), // Array of BatchJobResult
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  lastRunAt: timestamp("last_run_at"),
});

export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  content: jsonb("content").notNull(),
  description: text("description"),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertAnalysisSchema = createInsertSchema(analysisResults).pick({
  langsmithContent: true,
  datasetFiles: true,
  analysisData: true,
});

export const insertDatasetSchema = createInsertSchema(datasets).pick({
  name: true,
  filename: true,
  content: true,
  description: true,
  size: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = z.infer<typeof insertAnalysisSchema>;
export type Dataset = typeof datasets.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;

// Farm-specific types
export type AnimalTransaction = {
  category: string;
  head_count: number;
};

export type TracePattern = {
  id: string;
  category: string;
  title: string;
  description: string;
  examples: string[];
};

export type TraceInsight = {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: string;
  color: string;
};

export type AnalysisResponse = {
  response: string;
  examples: string[];
  patterns?: TracePattern[];
  insights?: TraceInsight[];
};

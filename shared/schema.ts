import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Existing users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Database verification schemas
export const dbConnectionSchema = z.object({
  type: z.enum(["mysql", "postgres", "sqlite"]),
  host: z.string().optional(),
  port: z.number().int().positive("Port must be a positive integer").optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().min(1, "Database name is required"),
  filePath: z.string().optional(), // For SQLite file path
  fileData: z.any().optional(), // For uploaded SQLite files (browser File object)
  fileId: z.string().optional(), // For uploaded SQLite files (server file ID)
});

export const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
});

export const tableComparisonSchema = z.object({
  tableName: z.string(),
  sourceRows: z.number(),
  targetRows: z.number(),
  schemaMatch: z.boolean(),
  status: z.enum(["MATCH", "MISMATCH"]),
  sourceColumns: z.array(columnSchema).optional(),
  targetColumns: z.array(columnSchema).optional(),
  dataMappingValid: z.boolean().optional(),
  dataMappingDetails: z.string().optional(),
});

export const verificationSummarySchema = z.object({
  status: z.enum(["SUCCESS", "MISMATCH"]),
  message: z.string(),
  completedAt: z.string(),
  totalTables: z.number(),
  matchedTables: z.number(),
  mismatchedTables: z.number(),
  totalRows: z.number(),
});

export const verificationResultSchema = z.object({
  summary: verificationSummarySchema,
  comparison: z.array(tableComparisonSchema),
});

export const verificationRequestSchema = z.object({
  source: dbConnectionSchema,
  target: dbConnectionSchema,
  sessionId: z.string().optional(),
});

export const verificationResponseSchema = verificationResultSchema;

// Export types
export type DBConnection = z.infer<typeof dbConnectionSchema>;
export type Column = z.infer<typeof columnSchema>;
export type TableComparison = z.infer<typeof tableComparisonSchema>;
export type VerificationSummary = z.infer<typeof verificationSummarySchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type VerificationRequest = z.infer<typeof verificationRequestSchema>;
export type VerificationResponse = z.infer<typeof verificationResponseSchema>;

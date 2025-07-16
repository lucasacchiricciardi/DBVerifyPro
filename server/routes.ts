import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { verificationService } from "./services/verification-service";
import { verificationRequestSchema, dbConnectionSchema } from "@shared/schema";
import { ApiResponseBuilder, addRequestId, standardErrorHandler } from './utils/api-response';
import { 
  secureVerificationRequestSchema, 
  secureDbConnectionSchema,
  validateFileUpload, 
  ValidationError 
} from './utils/input-validation';
import { 
  initializeSecurity, 
  rateLimit, 
  validationErrorHandler, 
  validateContentType 
} from './middleware/security';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

function log(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [API] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// In-memory store for uploaded files with database role tracking
const uploadedFiles = new Map<string, { path: string; originalName: string; uploadTime: number; databaseRole?: string }>();

// Clean up old files (older than 1 hour)
function cleanupOldFiles() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [fileId, fileInfo] of uploadedFiles.entries()) {
    if (fileInfo.uploadTime < oneHourAgo) {
      try {
        if (fs.existsSync(fileInfo.path)) {
          fs.unlinkSync(fileInfo.path);
        }
        uploadedFiles.delete(fileId);
        log('Cleaned up old file', { fileId, path: fileInfo.path });
      } catch (error) {
        log('Error cleaning up file', { fileId, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize security middleware
  app.use(initializeSecurity());
  
  // Add request ID middleware for better tracing
  app.use(addRequestId);
  app.use(validationErrorHandler);

  // Ensure temp directory exists
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // SQLite file upload endpoint with rate limiting and validation
  app.post("/api/upload-sqlite", 
    rateLimit('upload'),
    validateContentType(['application/json']),
    async (req, res) => {
    log('Received SQLite file upload request', {
      fileName: req.body.fileName,
      clearPrevious: req.body.clearPrevious
    });
    
    try {
      // Validate file upload
      if (!req.body.fileData || !req.body.fileName) {
        throw new ValidationError("File data and name are required", "file", "REQUIRED");
      }
      
      // Additional file validation
      validateFileUpload(req.body, req.body.fileName);

      // Get database role (source or target) to ensure proper isolation
      const databaseRole = req.body.databaseRole || 'unknown'; // Should be 'source' or 'target'
      
      log('SQLite upload with role', { databaseRole, fileName: req.body.fileName });
      
      // If clearPrevious is requested, clean up old files for this specific role
      if (req.body.clearPrevious) {
        log('Clearing previous SQLite files as requested', { databaseRole });
        
        // Remove old files for this specific database role
        for (const [oldFileId, fileInfo] of uploadedFiles.entries()) {
          // Only remove files from the same database role to avoid conflicts
          if (oldFileId.startsWith(`${databaseRole}_`)) {
            try {
              if (fs.existsSync(fileInfo.path)) {
                fs.unlinkSync(fileInfo.path);
              }
              uploadedFiles.delete(oldFileId);
              log('Removed old SQLite file for role', { fileId: oldFileId, path: fileInfo.path, role: databaseRole });
            } catch (cleanupError) {
              log('Error cleaning up old file', { fileId: oldFileId, error: cleanupError });
            }
          }
        }
        
        // Clear SQLite connections for this specific role
        verificationService.clearSQLiteConnectionsByRole(databaseRole);
        log('Cleared SQLite connections for role', { databaseRole });
      }

      // Create unique file ID with role prefix to avoid conflicts
      const fileId = `${databaseRole}_${uuidv4()}`;
      const filePath = path.join(tempDir, `${fileId}.db`);
      
      // Convert file data to buffer
      let buffer: Buffer;
      if (Array.isArray(req.body.fileData)) {
        buffer = Buffer.from(req.body.fileData);
      } else if (typeof req.body.fileData === 'string') {
        buffer = Buffer.from(req.body.fileData, 'base64');
      } else {
        return res.status(400).json({ message: "Invalid file data format" });
      }

      // Validate SQLite file signature
      const sqliteSignature = Buffer.from([0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00]);
      if (buffer.length < 16 || !buffer.subarray(0, 16).equals(sqliteSignature)) {
        return res.status(400).json({ message: "Invalid SQLite file format" });
      }

      // Write file to disk
      fs.writeFileSync(filePath, buffer);
      
      // Store file info with role metadata
      uploadedFiles.set(fileId, {
        path: filePath,
        originalName: req.body.fileName,
        uploadTime: Date.now(),
        databaseRole
      });

      log('SQLite file uploaded and validated successfully', { 
        fileId, 
        originalName: req.body.fileName, 
        size: buffer.length,
        databaseRole,
        cleared: req.body.clearPrevious || false
      });

      res.json({ 
        fileId, 
        message: "File uploaded successfully",
        originalName: req.body.fileName,
        size: buffer.length,
        cleared: req.body.clearPrevious || false
      });
    } catch (error) {
      log('File upload failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "File upload failed" 
      });
    }
  });

  // Database verification endpoint with enhanced security
  app.post("/api/verify", 
    rateLimit('verification'),
    validateContentType(['application/json']),
    async (req, res) => {
    log('Received verification request', {
      hasSource: !!req.body?.source,
      hasTarget: !!req.body?.target,
      sourceType: req.body?.source?.type,
      targetType: req.body?.target?.type,
      sessionId: req.body?.sessionId
    });
    
    try {
      // Enhanced security validation with sanitization
      log('Validating request body with security checks...');
      const validatedRequest = secureVerificationRequestSchema.parse(req.body);
      log('Enhanced security validation successful');
      
      // Resolve file IDs for SQLite connections before verification
      if (validatedRequest.source.type === 'sqlite' && validatedRequest.source.fileId) {
        const fileInfo = uploadedFiles.get(validatedRequest.source.fileId);
        if (fileInfo) {
          validatedRequest.source.filePath = fileInfo.path;
          log('Resolved source SQLite file', { fileId: validatedRequest.source.fileId, path: fileInfo.path });
        } else {
          log('Source SQLite file not found in upload registry', { fileId: validatedRequest.source.fileId });
          throw new Error(`Source SQLite file not found: ${validatedRequest.source.fileId}`);
        }
      }
      
      if (validatedRequest.target.type === 'sqlite' && validatedRequest.target.fileId) {
        const fileInfo = uploadedFiles.get(validatedRequest.target.fileId);
        if (fileInfo) {
          validatedRequest.target.filePath = fileInfo.path;
          log('Resolved target SQLite file', { fileId: validatedRequest.target.fileId, path: fileInfo.path });
        } else {
          log('Target SQLite file not found in upload registry', { fileId: validatedRequest.target.fileId });
          throw new Error(`Target SQLite file not found: ${validatedRequest.target.fileId}`);
        }
      }

      // Clear SQLite connections before starting verification to ensure clean state
      if (validatedRequest.source.type === 'sqlite' || validatedRequest.target.type === 'sqlite') {
        log('Clearing SQLite connections before verification');
        verificationService.clearSQLiteConnections();
      }

      // Perform verification
      log('Starting database verification process...');
      const result = await verificationService.verifyMigration(
        validatedRequest.source,
        validatedRequest.target
      );
      
      log('Verification completed successfully', {
        status: result.summary.status,
        tablesProcessed: result.summary.totalTables,
        matchedTables: result.summary.matchedTables
      });
      
      res.json(ApiResponseBuilder.success(result, (req as any).requestId));
    } catch (error) {
      log('Verification request failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined 
      });
      
      console.error("Verification error:", error);
      const response = error instanceof Error 
        ? ApiResponseBuilder.fromError(error, 'VERIFICATION_ERROR', (req as any).requestId)
        : ApiResponseBuilder.error('Verification failed', 'VERIFICATION_ERROR', undefined, (req as any).requestId);
      res.status(400).json(response);
    }
  });

  // Clear SQLite connections endpoint with rate limiting
  app.post("/api/clear-sqlite-connections", 
    rateLimit('default'),
    async (req, res) => {
    log('Clearing SQLite connections');
    
    try {
      verificationService.clearSQLiteConnections();
      res.json(ApiResponseBuilder.success({ message: "SQLite connections cleared successfully" }, (req as any).requestId));
    } catch (error) {
      log('Failed to clear SQLite connections', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      const response = error instanceof Error 
        ? ApiResponseBuilder.fromError(error, 'CLEAR_CONNECTIONS_ERROR', (req as any).requestId)
        : ApiResponseBuilder.error('Failed to clear SQLite connections', 'CLEAR_CONNECTIONS_ERROR', undefined, (req as any).requestId);
      res.status(500).json(response);
    }
  });

  // Test database connection endpoint with enhanced security
  app.post("/api/test-connection", 
    rateLimit('connection'),
    validateContentType(['application/json']),
    async (req, res) => {
    log('Received connection test request', {
      type: req.body?.type,
      host: req.body?.host,
      database: req.body?.database,
      fileId: req.body?.fileId,
      availableFiles: Array.from(uploadedFiles.keys()),
      uploadMapSize: uploadedFiles.size
    });
    
    try {
      // Validate and sanitize connection configuration
      const connectionConfig = secureDbConnectionSchema.parse(req.body);
      log('Testing database connection with secure validation...');
      
      // For SQLite connections, resolve file ID to file path
      if (connectionConfig.type === 'sqlite' && connectionConfig.fileId) {
        const fileInfo = uploadedFiles.get(connectionConfig.fileId);
        if (!fileInfo) {
          log('SQLite file not found in upload registry', { 
            requestedFileId: connectionConfig.fileId,
            availableFiles: Array.from(uploadedFiles.keys()),
            uploadMapSize: uploadedFiles.size
          });
          const response = ApiResponseBuilder.error(
            "SQLite file not found. Please upload the file again.", 
            'FILE_NOT_FOUND', 
            {
              connectivity: false,
              credentials: false,
              databaseExists: false,
              tablesFound: 0
            }, 
            (req as any).requestId
          );
          return res.status(400).json(response);
        }
        
        // Set the file path for database service
        connectionConfig.filePath = fileInfo.path;
        log('Using uploaded SQLite file', { fileId: connectionConfig.fileId, path: fileInfo.path });
      }
      
      // Test basic connectivity
      await verificationService.testConnection(connectionConfig);
      log('Basic connection test successful');
      
      // Get tables to verify database access and content (temporarily use database service directly)
      log('Discovering tables...');
      const { DatabaseService } = await import('./services/database');
      const databaseService = new DatabaseService();
      const tables = await databaseService.getTables(connectionConfig);
      log('Table discovery completed', { tablesFound: tables.length });
      
      const details = {
        connectivity: true,
        credentials: true,
        databaseExists: true,
        tablesFound: tables.length,
        tableNames: tables
      };
      
      res.json(ApiResponseBuilder.success({
        message: "CONNECTION_SUCCESSFUL", // Frontend will translate this key
        details 
      }, (req as any).requestId));
    } catch (error) {
      log('Connection test failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Try to provide more specific error information
      let details = {
        connectivity: false,
        credentials: false,
        databaseExists: false,
        tablesFound: 0
      };
      
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      
      // Basic error categorization
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT')) {
        details.connectivity = false;
      } else if (errorMessage.includes('Access denied') || errorMessage.includes('authentication failed') || errorMessage.includes('password authentication failed')) {
        details.connectivity = true;
        details.credentials = false;
      } else if (errorMessage.includes('database') && errorMessage.includes('does not exist')) {
        details.connectivity = true;
        details.credentials = true;
        details.databaseExists = false;
      }
      
      const response = ApiResponseBuilder.error(errorMessage, 'CONNECTION_ERROR', details, (req as any).requestId);
      res.status(400).json(response);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

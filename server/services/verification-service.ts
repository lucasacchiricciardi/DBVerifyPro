/**
 * Verification Service - Handles database migration verification logic
 * Separated from DatabaseService for better separation of concerns
 */

import type { DBConnection, VerificationResult } from '@shared/schema';
import { DatabaseService } from './database';
import { progressService } from './progress-service';
import { logError, withTimeout } from '../utils/error-handler';
import { appConfig } from '../config/app-config';
import { v4 as uuidv4 } from 'uuid';

export class VerificationService {
  private databaseService: DatabaseService;

  constructor() {
    this.databaseService = new DatabaseService();
  }

  private log(message: string, data?: any): void {
    if (appConfig.logging.enableStructuredLogging) {
      console.log(`[${new Date().toISOString()}] [VerificationService] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    } else {
      console.log(`[VerificationService] ${message}`, data || '');
    }
  }

  /**
   * Main verification method that orchestrates the entire verification process
   */
  async verifyMigration(sourceConfig: DBConnection, targetConfig: DBConnection): Promise<VerificationResult> {
    try {
      const sessionId = uuidv4();
      
      this.log('Starting migration verification', {
        sessionId,
        source: { type: sourceConfig.type, database: sourceConfig.database },
        target: { type: targetConfig.type, database: targetConfig.database }
      });

      // Get table count for progress tracking
      const sourceTables = await this.databaseService.getTables(sourceConfig);
      const targetTables = await this.databaseService.getTables(targetConfig);
      const commonTables = sourceTables.filter(table => targetTables.includes(table));
      
      // Start progress session
      progressService.startSession(sessionId, commonTables.length);
      
      try {
        // Delegate to database service for the actual verification
        const result = await this.databaseService.verifyMigration(sourceConfig, targetConfig, sessionId);
        
        // Complete progress session
        progressService.completeSession(
          sessionId, 
          result.summary.status === 'SUCCESS',
          `Verification completed: ${result.summary.matchedTables}/${result.summary.totalTables} tables matched`
        );
        
        this.log('Migration verification completed', {
          sessionId,
          status: result.summary.status,
          totalTables: result.summary.totalTables,
          matchedTables: result.summary.matchedTables,
          mismatchedTables: result.summary.mismatchedTables
        });

        return result;
      } catch (error) {
        progressService.completeSession(sessionId, false, `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown verification error'), { sourceConfig, targetConfig });
      throw error;
    }
  }

  /**
   * Test database connections
   */
  async testConnection(config: DBConnection): Promise<void> {
    try {
      this.log('Testing database connection', {
        type: config.type,
        database: config.database,
        host: config.host
      });

      await this.databaseService.testConnection(config);
      
      this.log('Database connection test successful', {
        type: config.type,
        database: config.database
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown connection test error'), { config });
      throw error;
    }
  }

  /**
   * Clear SQLite connections (delegated to database service)
   */
  clearSQLiteConnections(): void {
    this.log('Clearing SQLite connections');
    this.databaseService.clearSQLiteConnections();
  }

  clearSQLiteConnectionsByRole(databaseRole: string): void {
    this.log(`Clearing SQLite connections for role: ${databaseRole}`);
    this.databaseService.clearSQLiteConnectionsByRole(databaseRole);
  }
}

// Export singleton instance
export const verificationService = new VerificationService();
/**
 * Centralized application configuration
 * Provides environment-based configuration with sensible defaults
 */

export interface DatabaseConfig {
  connectionTimeout: number;
  queryTimeout: number;
  maxRetries: number;
  retryDelay: number;
  maxConcurrentConnections: number;
}

export interface VerificationConfig {
  maxConcurrentTables: number;
  tableBatchSize: number;
  sampleDataSize: number;
  processingTimeout: number;
  enableParallelProcessing: boolean;
}

export interface FileUploadConfig {
  maxFileSize: number;
  allowedExtensions: string[];
  uploadTimeout: number;
  tempFileCleanupInterval: number;
  tempFileRetentionHours: number;
}

export interface AppConfig {
  database: DatabaseConfig;
  verification: VerificationConfig;
  fileUpload: FileUploadConfig;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableStructuredLogging: boolean;
  };
}

// Environment-based configuration with defaults
export const createAppConfig = (): AppConfig => {
  const env = process.env;
  
  return {
    database: {
      connectionTimeout: parseInt(env.DB_CONNECTION_TIMEOUT || '30000'),
      queryTimeout: parseInt(env.DB_QUERY_TIMEOUT || '60000'),
      maxRetries: parseInt(env.DB_MAX_RETRIES || '3'),
      retryDelay: parseInt(env.DB_RETRY_DELAY || '1000'),
      maxConcurrentConnections: parseInt(env.DB_MAX_CONCURRENT_CONNECTIONS || '10'),
    },
    verification: {
      maxConcurrentTables: parseInt(env.VERIFICATION_MAX_CONCURRENT_TABLES || '5'),
      tableBatchSize: parseInt(env.VERIFICATION_TABLE_BATCH_SIZE || '10'),
      sampleDataSize: parseInt(env.VERIFICATION_SAMPLE_DATA_SIZE || '5'),
      processingTimeout: parseInt(env.VERIFICATION_PROCESSING_TIMEOUT || '30000'),
      enableParallelProcessing: env.VERIFICATION_ENABLE_PARALLEL !== 'false',
    },
    fileUpload: {
      maxFileSize: parseInt(env.FILE_UPLOAD_MAX_SIZE || '104857600'), // 100MB
      allowedExtensions: (env.FILE_UPLOAD_ALLOWED_EXTENSIONS || '.db,.sqlite,.sqlite3').split(','),
      uploadTimeout: parseInt(env.FILE_UPLOAD_TIMEOUT || '30000'),
      tempFileCleanupInterval: parseInt(env.TEMP_FILE_CLEANUP_INTERVAL || '3600000'), // 1 hour
      tempFileRetentionHours: parseInt(env.TEMP_FILE_RETENTION_HOURS || '24'),
    },
    logging: {
      level: (env.LOG_LEVEL as any) || 'info',
      enableStructuredLogging: env.ENABLE_STRUCTURED_LOGGING === 'true',
    },
  };
};

// Global configuration instance
export const appConfig = createAppConfig();

// Configuration validation
export const validateConfig = (config: AppConfig): string[] => {
  const errors: string[] = [];
  
  if (config.database.connectionTimeout < 1000) {
    errors.push('Database connection timeout must be at least 1000ms');
  }
  
  if (config.verification.maxConcurrentTables < 1 || config.verification.maxConcurrentTables > 20) {
    errors.push('Max concurrent tables must be between 1 and 20');
  }
  
  if (config.fileUpload.maxFileSize < 1024 || config.fileUpload.maxFileSize > 1073741824) {
    errors.push('Max file size must be between 1KB and 1GB');
  }
  
  return errors;
};

// Initialize and validate configuration
const configErrors = validateConfig(appConfig);
if (configErrors.length > 0) {
  console.error('Configuration validation failed:', configErrors);
  process.exit(1);
}

export default appConfig;
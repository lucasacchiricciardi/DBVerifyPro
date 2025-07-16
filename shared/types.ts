// Centralized type definitions for better type safety

export interface DatabaseRow {
  [key: string]: any;
}

export interface TableInfo {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface DatabaseMetadata {
  version: string;
  encoding: string;
  collation?: string;
  timezone?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  metadata?: DatabaseMetadata;
  details: {
    connectivity: boolean;
    credentials: boolean;
    databaseExists: boolean;
    tablesFound: number;
    tableNames?: string[];
  };
}

export interface VerificationProgress {
  currentTable: string;
  tablesCompleted: number;
  totalTables: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

export interface DataMappingResult {
  isValid: boolean;
  details: string;
  issues?: string[];
  samplesCompared: number;
}

export interface SchemaComparisonDetails {
  sourceColumns: ColumnInfo[];
  targetColumns: ColumnInfo[];
  missingColumns: string[];
  extraColumns: string[];
  typeConflicts: Array<{
    column: string;
    sourceType: string;
    targetType: string;
    compatible: boolean;
  }>;
}

export interface TableVerificationResult {
  tableName: string;
  sourceRows: number;
  targetRows: number;
  schemaMatch: boolean;
  rowsMatch: boolean;
  dataMappingValid: boolean;
  status: 'MATCH' | 'MISMATCH' | 'ERROR';
  schemaDetails?: SchemaComparisonDetails;
  dataMappingResult?: DataMappingResult;
  error?: string;
  processingTime: number;
}

export interface VerificationSession {
  id: string;
  startTime: string;
  endTime?: string;
  sourceDatabase: {
    type: string;
    name: string;
    host?: string;
  };
  targetDatabase: {
    type: string;
    name: string;
    host?: string;
  };
  progress: VerificationProgress;
  results: TableVerificationResult[];
  summary?: {
    status: 'SUCCESS' | 'MISMATCH' | 'ERROR';
    totalTables: number;
    matchedTables: number;
    mismatchedTables: number;
    errorTables: number;
    totalRows: number;
    processingTime: number;
  };
}

export interface FileUploadResult {
  fileId: string;
  originalName: string;
  size: number;
  validationResult: {
    isValid: boolean;
    format: string;
    version?: string;
    errors?: string[];
  };
}

export interface DatabaseCapabilities {
  supportsTransactions: boolean;
  supportsConstraints: boolean;
  supportsIndexes: boolean;
  supportsViews: boolean;
  supportsStoredProcedures: boolean;
  maxIdentifierLength: number;
  supportedDataTypes: string[];
}

// Query result types for better type safety
export interface MySQLTableRow {
  TABLE_NAME: string;
  TABLE_SCHEMA: string;
  TABLE_TYPE: string;
  ENGINE?: string;
  TABLE_ROWS?: number;
  name: string; // For SHOW TABLES compatibility
}

export interface MySQLColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: 'YES' | 'NO';
  COLUMN_DEFAULT?: string;
  CHARACTER_MAXIMUM_LENGTH?: number;
  NUMERIC_PRECISION?: number;
  NUMERIC_SCALE?: number;
}

export interface PostgreSQLTableRow {
  table_name: string;
  table_schema: string;
  table_type: string;
}

export interface PostgreSQLColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default?: string;
  character_maximum_length?: number;
  numeric_precision?: number;
  numeric_scale?: number;
}

export interface SQLiteTableRow {
  name: string;
  type: string;
  sql: string;
}

export interface SQLiteColumnRow {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value?: string;
  pk: 0 | 1;
}

// Type guards for runtime type checking
export function isMySQLColumnRow(row: any): row is MySQLColumnRow {
  return row && typeof row.COLUMN_NAME === 'string' && typeof row.DATA_TYPE === 'string';
}

export function isPostgreSQLColumnRow(row: any): row is PostgreSQLColumnRow {
  return row && typeof row.column_name === 'string' && typeof row.data_type === 'string';
}

export function isSQLiteColumnRow(row: any): row is SQLiteColumnRow {
  return row && typeof row.name === 'string' && typeof row.type === 'string';
}

// Utility types for API responses
export type ApiResult<T> = {
  success: true;
  data: T;
  timestamp: string;
} | {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
};

// Configuration types
export interface DatabaseConfig {
  connectionTimeout: number;
  queryTimeout: number;
  maxRetries: number;
  retryDelay: number;
  poolSize?: number;
}

export interface SystemConfig {
  database: DatabaseConfig;
  fileUpload: {
    maxSize: number;
    allowedTypes: string[];
    tempDirectory: string;
    cleanupInterval: number;
  };
  verification: {
    defaultSampleSize: number;
    maxTablesPerVerification: number;
    parallelProcessing: boolean;
    maxConcurrency: number;
  };
}
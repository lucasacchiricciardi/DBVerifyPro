export type DatabaseType = 'mysql' | 'postgres';

export interface DatabaseConnection {
  type: DatabaseType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  tableName: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ComparisonResult {
  tableName: string;
  sourceRows: number;
  targetRows: number;
  schemaMatch: boolean;
  status: 'MATCH' | 'MISMATCH';
  sourceColumns?: ColumnInfo[];
  targetColumns?: ColumnInfo[];
}

export interface VerificationStats {
  totalTables: number;
  matchedTables: number;
  mismatchedTables: number;
  totalRows: number;
}

export interface VerificationSummary {
  status: 'SUCCESS' | 'MISMATCH';
  message: string;
}

export interface VerificationResponse {
  summary: VerificationSummary;
  comparison: ComparisonResult[];
  stats: VerificationStats;
}

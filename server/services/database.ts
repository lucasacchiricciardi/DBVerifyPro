import mysql from "mysql2/promise";
import { Client } from "pg";
import path from 'path';
import fs from 'fs';
import type { DBConnection, Column, TableComparison, VerificationResult } from "@shared/schema";
import type { MySQLColumnRow, PostgreSQLColumnRow, TableVerificationResult, DataMappingResult } from "@shared/types";
import { sqliteManager } from "../utils/sqlite-manager";
import { DatabaseError, withTimeout, logError } from "../utils/error-handler";
import { connectionPool } from "./connection-pool";
import { appConfig } from "../config/app-config";
import { schemaCache } from "./schema-cache";

export class DatabaseService {
  private static readonly CONNECTION_TIMEOUT = appConfig.database.connectionTimeout;
  private static readonly QUERY_TIMEOUT = appConfig.database.queryTimeout;
  
  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DatabaseService] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  // Clear all active SQLite connections
  clearSQLiteConnections(): void {
    this.log('Clearing all SQLite connections via manager');
    sqliteManager.closeAllConnections();
  }

  // Clear SQLite connections for a specific database role
  clearSQLiteConnectionsByRole(databaseRole: string): void {
    this.log(`Clearing SQLite connections for role: ${databaseRole}`);
    sqliteManager.closeConnectionsByRole(databaseRole);
  }

  // Remove duplicate method - now handled by SQLiteManager

  async testConnection(config: DBConnection): Promise<void> {
    try {
      this.log(`Testing connection to ${config.type} database`, {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        filePath: config.filePath
      });
      
      if (config.type === "sqlite") {
        return withTimeout(
          sqliteManager.testConnection(config),
          DatabaseService.CONNECTION_TIMEOUT,
          'SQLite connection test'
        );
      }
      
      if (config.type === "mysql") {
        this.log('Testing MySQL connection...');
        return withTimeout(
          this.testMySQLConnection(config),
          DatabaseService.CONNECTION_TIMEOUT,
          'MySQL connection test'
        );
      }
      
      if (config.type === "postgres") {
        this.log('Testing PostgreSQL connection...');
        return withTimeout(
          this.testPostgreSQLConnection(config),
          DatabaseService.CONNECTION_TIMEOUT,
          'PostgreSQL connection test'
        );
      }
      
      throw new Error(`Unsupported database type: ${config.type}`);
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown database error'), { config });
      throw error;
    }
  }

  private async testMySQLConnection(config: DBConnection): Promise<void> {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: DatabaseService.CONNECTION_TIMEOUT,
      acquireTimeout: DatabaseService.CONNECTION_TIMEOUT,
      timeout: DatabaseService.QUERY_TIMEOUT,
    });
    
    try {
      this.log('Testing MySQL connection with ping...');
      await connection.ping();
      this.log('MySQL connection test successful');
    } catch (error) {
      throw new DatabaseError(`MySQL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CONNECTION_ERROR', { originalError: error });
    } finally {
      await connection.end();
    }
  }

  private async testPostgreSQLConnection(config: DBConnection): Promise<void> {
    const client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: DatabaseService.CONNECTION_TIMEOUT,
      query_timeout: DatabaseService.QUERY_TIMEOUT,
    });

    try {
      this.log('Connecting to PostgreSQL...');
      await client.connect();
      this.log('Testing PostgreSQL connection...');
      await client.query('SELECT 1');
      this.log('PostgreSQL connection test successful');
    } catch (error) {
      throw new DatabaseError(`PostgreSQL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CONNECTION_ERROR', { originalError: error });
    } finally {
      await client.end();
    }
  }

  async getTables(config: DBConnection): Promise<string[]> {
    try {
      this.log(`Fetching tables from ${config.type} database`, { database: config.database });
      
      if (config.type === "sqlite") {
        return withTimeout(
          sqliteManager.getTables(config),
          DatabaseService.QUERY_TIMEOUT,
          'SQLite getTables'
        );
      }
      
      if (config.type === "mysql") {
        return withTimeout(
          this.getMySQLTables(config),
          DatabaseService.QUERY_TIMEOUT,
          'MySQL getTables'
        );
      }
      
      if (config.type === "postgres") {
        return withTimeout(
          this.getPostgreSQLTables(config),
          DatabaseService.QUERY_TIMEOUT,
          'PostgreSQL getTables'
        );
      }
      
      throw new Error(`Unsupported database type: ${config.type}`);
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown getTables error'), { config });
      throw error;
    }
  }

  private async getMySQLTables(config: DBConnection): Promise<string[]> {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      timeout: DatabaseService.QUERY_TIMEOUT,
    });

    try {
      this.log('Executing MySQL table discovery query...');
      const [rows] = await connection.execute("SHOW TABLES");
      
      const tables = (rows as any[]).map(row => Object.values(row)[0] as string);
      this.log(`Found ${tables.length} tables in MySQL database`, { tables });
      return tables;
    } catch (error) {
      throw new DatabaseError(`MySQL table discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await connection.end();
    }
  }

  private async getPostgreSQLTables(config: DBConnection): Promise<string[]> {
    const client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: { rejectUnauthorized: false },
      query_timeout: DatabaseService.QUERY_TIMEOUT,
    });

    try {
      await client.connect();
      this.log('Executing PostgreSQL table discovery query...');
      
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema IN ($1, 'public')
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, [config.database]);
      
      const tables = result.rows.map(row => row.table_name);
      this.log(`Found ${tables.length} tables in PostgreSQL database`, { tables });
      return tables;
    } catch (error) {
      throw new DatabaseError(`PostgreSQL table discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await client.end();
    }
  }

  async getTableRowCount(config: DBConnection, tableName: string): Promise<number> {
    try {
      this.log(`Getting row count for table: ${tableName} from ${config.type} database`);
      
      if (config.type === "sqlite") {
        return withTimeout(
          sqliteManager.getTableRowCount(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'SQLite getTableRowCount'
        );
      }
      
      if (config.type === "mysql") {
        return withTimeout(
          this.getMySQLRowCount(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'MySQL getTableRowCount'
        );
      }
      
      if (config.type === "postgres") {
        return withTimeout(
          this.getPostgreSQLRowCount(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'PostgreSQL getTableRowCount'
        );
      }
      
      throw new DatabaseError(`Unsupported database type: ${config.type}`, 'VALIDATION_ERROR');
    } catch (error) {
      throw error instanceof DatabaseError ? error : new DatabaseError(`Get table row count failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'OPERATION_ERROR', { originalError: error });
    }
  }

  private async getMySQLRowCount(config: DBConnection, tableName: string): Promise<number> {
    const connection = await connectionPool.getConnection(config) as mysql.Connection;

    try {
      this.log(`Executing MySQL COUNT query for table "${tableName}"`);
      const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      
      const count = (rows as any[])[0].count;
      this.log(`Table "${tableName}" has ${count} rows`);
      return count;
    } catch (error) {
      throw new DatabaseError(`MySQL row count for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await connectionPool.releaseConnection(connection);
    }
  }

  private async getPostgreSQLRowCount(config: DBConnection, tableName: string): Promise<number> {
    const client = await connectionPool.getConnection(config) as Client;

    try {
      this.log(`Executing PostgreSQL COUNT query for table "${tableName}"`);
      
      let result;
      try {
        result = await client.query(`SELECT COUNT(*) as count FROM "${config.database}"."${tableName}"`);
      } catch (error) {
        result = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      }
      
      const count = parseInt(result.rows[0].count);
      this.log(`Table "${tableName}" has ${count} rows`);
      return count;
    } catch (error) {
      throw new DatabaseError(`PostgreSQL row count for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await connectionPool.releaseConnection(client);
    }
  }



  async getTableSchema(config: DBConnection, tableName: string): Promise<Column[]> {
    try {
      // Check cache first (not for SQLite files as they can change)
      if (config.type !== "sqlite") {
        const cachedSchema = schemaCache.get(config, tableName);
        if (cachedSchema) {
          this.log(`Using cached schema for table "${tableName}"`);
          return cachedSchema;
        }
      }

      this.log(`Getting schema for table "${tableName}" in ${config.type} database`);
      
      let schema: Column[];
      
      if (config.type === "sqlite") {
        schema = await withTimeout(
          sqliteManager.getTableSchema(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'SQLite getTableSchema'
        );
      } else if (config.type === "mysql") {
        schema = await withTimeout(
          this.getMySQLTableSchema(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'MySQL getTableSchema'
        );
      } else if (config.type === "postgres") {
        schema = await withTimeout(
          this.getPostgreSQLTableSchema(config, tableName),
          DatabaseService.QUERY_TIMEOUT,
          'PostgreSQL getTableSchema'
        );
      } else {
        throw new DatabaseError(`Unsupported database type: ${config.type}`, 'VALIDATION_ERROR');
      }

      // Cache the result (not for SQLite files)
      if (config.type !== "sqlite" && schema) {
        schemaCache.set(config, tableName, schema);
      }

      return schema;
    } catch (error) {
      throw error instanceof DatabaseError ? error : new DatabaseError(`Get table schema failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'OPERATION_ERROR', { originalError: error });
    }
  }

  private async getMySQLTableSchema(config: DBConnection, tableName: string): Promise<Column[]> {
    const connection = await connectionPool.getConnection(config) as mysql.Connection;

    try {
      this.log(`Executing MySQL schema query for table "${tableName}"`);
      const [rows] = await connection.execute(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [config.database, tableName]);
      
      const columns = (rows as MySQLColumnRow[]).map(row => ({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        nullable: row.IS_NULLABLE === "YES",
      }));
      this.log(`Table "${tableName}" schema retrieved`, { columnCount: columns.length, columns });
      return columns;
    } catch (error) {
      throw new DatabaseError(`MySQL schema for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await connectionPool.releaseConnection(connection);
    }
  }

  private async getPostgreSQLTableSchema(config: DBConnection, tableName: string): Promise<Column[]> {
    const client = await connectionPool.getConnection(config) as Client;

    try {
      this.log(`Executing PostgreSQL schema query for table "${tableName}"`);
      const result = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema IN ($2, 'public')
        ORDER BY ordinal_position
      `, [tableName, config.database]);
      
      const columns = result.rows.map((row: PostgreSQLColumnRow) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
      }));
      this.log(`Table "${tableName}" schema retrieved`, { columnCount: columns.length, columns });
      return columns;
    } catch (error) {
      throw new DatabaseError(`PostgreSQL schema for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_ERROR', { originalError: error });
    } finally {
      await connectionPool.releaseConnection(client);
    }
  }

  private compareSchemas(sourceColumns: Column[], targetColumns: Column[]): boolean {
    this.log('Comparing schemas', { 
      sourceColumnCount: sourceColumns.length, 
      targetColumnCount: targetColumns.length 
    });
    
    if (sourceColumns.length !== targetColumns.length) {
      this.log('Schema comparison failed: Different number of columns');
      return false;
    }

    for (let i = 0; i < sourceColumns.length; i++) {
      const source = sourceColumns[i];
      const target = targetColumns[i];
      
      this.log(`Comparing column ${i + 1}`, { 
        source: { name: source.name, type: source.type, nullable: source.nullable },
        target: { name: target.name, type: target.type, nullable: target.nullable }
      });
      
      // Compare names case-insensitively for MySQL to PostgreSQL migrations
      if (source.name.toLowerCase() !== target.name.toLowerCase()) {
        this.log(`Schema comparison failed at column ${i + 1}: Name mismatch`, {
          sourceName: source.name,
          targetName: target.name
        });
        return false;
      }
      
      // Check nullable status
      if (source.nullable !== target.nullable) {
        this.log(`Schema comparison failed at column ${i + 1}: Nullable mismatch`, {
          sourceNullable: source.nullable,
          targetNullable: target.nullable
        });
        return false;
      }
      
      // Allow compatible type mappings
      if (!this.areTypesCompatible(source.type, target.type)) {
        this.log(`Schema comparison failed at column ${i + 1}: Incompatible types`);
        return false;
      }
    }
    
    this.log('Schema comparison successful: All columns match');
    return true;
  }

  private areTypesCompatible(sourceType: string, targetType: string): boolean {
    // Enhanced type compatibility mapping for MySQL to PostgreSQL migration
    const typeMap: { [key: string]: string[] } = {
      // String types
      'varchar': ['character varying', 'text', 'varchar', 'char', 'character'],
      'char': ['character', 'char', 'character varying', 'varchar'],
      'text': ['text', 'character varying', 'varchar'],
      'longtext': ['text', 'character varying'],
      'mediumtext': ['text', 'character varying'],
      'tinytext': ['text', 'character varying', 'varchar'],
      
      // Integer types
      'int': ['integer', 'bigint', 'int', 'int4', 'int8'],
      'integer': ['integer', 'bigint', 'int', 'int4', 'int8'],
      'tinyint': ['smallint', 'integer', 'boolean', 'int2', 'int4'],
      'smallint': ['smallint', 'integer', 'int2', 'int4'],
      'mediumint': ['integer', 'int4'],
      'bigint': ['bigint', 'integer', 'int8', 'int4'],
      
      // Decimal/Numeric types
      'decimal': ['numeric', 'decimal'],
      'numeric': ['numeric', 'decimal'],
      'float': ['real', 'double precision', 'float4', 'float8'],
      'double': ['double precision', 'real', 'float8', 'float4'],
      'real': ['real', 'float4'],
      
      // Date/Time types
      'datetime': ['timestamp', 'timestamp without time zone', 'timestamp with time zone'],
      'timestamp': ['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'datetime'],
      'date': ['date'],
      'time': ['time', 'time without time zone'],
      'year': ['integer', 'smallint'],
      
      // Boolean types
      'boolean': ['boolean', 'bool'],
      'bool': ['boolean', 'bool'],
      
      // Binary types
      'blob': ['bytea', 'blob'],
      'longblob': ['bytea', 'blob'],
      'mediumblob': ['bytea', 'blob'],
      'tinyblob': ['bytea', 'blob'],
      'binary': ['bytea', 'blob'],
      'varbinary': ['bytea', 'blob'],
      
      // SQLite types
      'TEXT': ['text', 'character varying', 'varchar', 'char'],
      'INTEGER': ['integer', 'bigint', 'int', 'smallint', 'int4', 'int8', 'int2'],
      'REAL': ['real', 'double precision', 'float', 'numeric', 'decimal'],
      'NUMERIC': ['numeric', 'decimal', 'real', 'double precision'],
      'BLOB': ['bytea', 'blob'],
      
      // JSON types
      'json': ['json', 'jsonb'],
      'jsonb': ['json', 'jsonb'],
    };

    // Normalize types to lowercase for comparison
    const normalizedSource = sourceType.toLowerCase().trim();
    const normalizedTarget = targetType.toLowerCase().trim();
    
    this.log(`Comparing types: "${normalizedSource}" vs "${normalizedTarget}"`);
    
    // Exact match
    if (normalizedSource === normalizedTarget) {
      this.log(`Types match exactly: ${normalizedSource}`);
      return true;
    }
    
    // Check if source type maps to target type
    if (typeMap[normalizedSource]) {
      const isCompatible = typeMap[normalizedSource].includes(normalizedTarget);
      this.log(`Direct mapping check: ${normalizedSource} -> ${normalizedTarget} = ${isCompatible}`);
      if (isCompatible) return true;
    }
    
    // Check reverse mapping (target type maps to source type)
    if (typeMap[normalizedTarget]) {
      const isCompatible = typeMap[normalizedTarget].includes(normalizedSource);
      this.log(`Reverse mapping check: ${normalizedTarget} -> ${normalizedSource} = ${isCompatible}`);
      if (isCompatible) return true;
    }
    
    // Check if both types are in the same compatibility group
    for (const [baseType, compatibleTypes] of Object.entries(typeMap)) {
      if (compatibleTypes.includes(normalizedSource) && compatibleTypes.includes(normalizedTarget)) {
        this.log(`Both types found in compatibility group "${baseType}": ${normalizedSource}, ${normalizedTarget}`);
        return true;
      }
    }
    
    this.log(`Types are not compatible: ${normalizedSource} vs ${normalizedTarget}`);
    return false;
  }

  private async verifyDataMapping(sourceConfig: DBConnection, targetConfig: DBConnection, tableName: string, sampleSize: number = appConfig.verification.sampleDataSize): Promise<{ isValid: boolean; details: string }> {
    this.log(`Verifying data mapping for table "${tableName}" with sample size ${sampleSize}`);
    
    try {
      // Special case: If both configs are SQLite and point to the same database file,
      // they are identical by definition
      if (sourceConfig.type === 'sqlite' && targetConfig.type === 'sqlite') {
        // Check if they're using the same database name/file
        if (sourceConfig.database === targetConfig.database) {
          this.log(`Same SQLite database detected for source and target: ${sourceConfig.database}`);
          return {
            isValid: true,
            details: `Identical SQLite database - same file for source and target`
          };
        }
      }
      
      // Get sample data from both databases
      const sourceData = await this.getSampleData(sourceConfig, tableName, sampleSize);
      const targetData = await this.getSampleData(targetConfig, tableName, sampleSize);
      
      if (sourceData.length !== targetData.length) {
        return {
          isValid: false,
          details: `Row count mismatch in sample: source=${sourceData.length}, target=${targetData.length}`
        };
      }
      
      // Compare each row
      for (let i = 0; i < sourceData.length; i++) {
        const sourceRow = sourceData[i];
        const targetRow = targetData[i];
        
        // Get column names (they should match after schema verification)
        const sourceKeys = Object.keys(sourceRow);
        const targetKeys = Object.keys(targetRow);
        
        if (sourceKeys.length !== targetKeys.length) {
          return {
            isValid: false,
            details: `Column count mismatch in row ${i + 1}: source=${sourceKeys.length}, target=${targetKeys.length}`
          };
        }
        
        // Compare each column value (handle case-insensitive column names)
        for (const sourceKey of sourceKeys) {
          // Find matching target key (case-insensitive)
          const targetKey = targetKeys.find(tk => tk.toLowerCase() === sourceKey.toLowerCase());
          
          if (!targetKey) {
            return {
              isValid: false,
              details: `Column "${sourceKey}" not found in target row ${i + 1}`
            };
          }
          
          const sourceValue = sourceRow[sourceKey];
          const targetValue = targetRow[targetKey];
          
          // Handle null values
          if (sourceValue === null && targetValue === null) continue;
          if (sourceValue === null || targetValue === null) {
            return {
              isValid: false,
              details: `Null value mismatch in row ${i + 1}, column "${sourceKey}": source=${sourceValue}, target=${targetValue}`
            };
          }
          
          // Convert to string for comparison (handles type differences)
          const sourceStr = String(sourceValue).trim();
          const targetStr = String(targetValue).trim();
          
          if (sourceStr !== targetStr) {
            return {
              isValid: false,
              details: `Value mismatch in row ${i + 1}, column "${sourceKey}/${targetKey}": source="${sourceStr}", target="${targetStr}"`
            };
          }
        }
      }
      
      return {
        isValid: true,
        details: `All ${sourceData.length} sample rows match perfectly`
      };
      
    } catch (error) {
      this.log(`Error verifying data mapping for table "${tableName}":`, error);
      return {
        isValid: false,
        details: `Error during data mapping verification: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async getSampleData(config: DBConnection, tableName: string, sampleSize: number): Promise<any[]> {
    this.log(`Getting sample data from ${config.type} database for table "${tableName}"`);
    
    if (config.type === "sqlite") {
      let dbPath = config.filePath;
      
      // Handle uploaded file data
      if (config.fileData) {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        dbPath = path.join(tempDir, `temp_${Date.now()}.db`);
        
        let buffer: Buffer;
        if (config.fileData instanceof ArrayBuffer) {
          buffer = Buffer.from(config.fileData);
        } else if (typeof config.fileData === 'string') {
          buffer = Buffer.from(config.fileData, 'base64');
        } else {
          throw new Error('Unsupported file data format');
        }
        
        fs.writeFileSync(dbPath, buffer);
      }
      
      if (!dbPath || !fs.existsSync(dbPath)) {
        throw new Error('SQLite database file not found');
      }
      
      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            reject(new Error(`SQLite connection failed: ${err.message}`));
            return;
          }
          
          const query = `SELECT * FROM "${tableName}" LIMIT ${sampleSize}`;
          
          db.all(query, [], (err, rows: any[]) => {
            if (err) {
              this.log('Error getting SQLite sample data', { table: tableName, error: err.message });
              db.close();
              reject(new Error(`Error getting sample data: ${err.message}`));
              return;
            }
            
            this.log('SQLite sample data retrieved', { table: tableName, rows: rows.length });
            
            db.close((closeErr) => {
              if (closeErr) {
                this.log('Error closing SQLite connection', { error: closeErr.message });
              }
              resolve(rows);
            });
          });
        });
      });
    } else if (config.type === "mysql") {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      });

      const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\` LIMIT ${sampleSize}`);
      await connection.end();
      return rows as any[];
      
    } else if (config.type === "postgres") {
      const client = new Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: { rejectUnauthorized: false },
      });

      await client.connect();
      // Try with schema name first, then without
      let result;
      try {
        result = await client.query(`SELECT * FROM "${config.database}"."${tableName}" LIMIT ${sampleSize}`);
      } catch (error) {
        result = await client.query(`SELECT * FROM "${tableName}" LIMIT ${sampleSize}`);
      }
      await client.end();
      return result.rows;
    }
    
    throw new Error("Unsupported database type");
  }

  async verifyMigration(sourceConfig: DBConnection, targetConfig: DBConnection, sessionId?: string): Promise<VerificationResult> {
    this.log('Starting migration verification', {
      source: { type: sourceConfig.type, database: sourceConfig.database },
      target: { type: targetConfig.type, database: targetConfig.database }
    });
    
    try {
      // Test connections
      this.log('Testing database connections...');
      await this.testConnection(sourceConfig);
      await this.testConnection(targetConfig);
      this.log('Both database connections successful');

      // Get tables from both databases
      this.log('Fetching table lists from both databases...');
      const sourceTables = await this.getTables(sourceConfig);
      const targetTables = await this.getTables(targetConfig);
      
      // Find common tables
      const commonTables = sourceTables.filter(table => targetTables.includes(table));
      const missingInTarget = sourceTables.filter(table => !targetTables.includes(table));
      const extraInTarget = targetTables.filter(table => !sourceTables.includes(table));
      
      this.log('Table analysis complete', {
        sourceTables: sourceTables.length,
        targetTables: targetTables.length,
        commonTables: commonTables.length,
        missingInTarget: missingInTarget.length,
        extraInTarget: extraInTarget.length
      });
      
      if (missingInTarget.length > 0) {
        this.log('Tables missing in target database', { missingTables: missingInTarget });
      }
      
      if (extraInTarget.length > 0) {
        this.log('Extra tables in target database', { extraTables: extraInTarget });
      }
      
      const comparison: TableComparison[] = [];
      let totalSourceRows = 0;
      let matchedTables = 0;
      
      this.log(`Starting detailed verification of ${commonTables.length} common tables...`);
      
      // Process tables in parallel with configurable concurrency
      if (appConfig.verification.enableParallelProcessing && commonTables.length > 1) {
        this.log('Using parallel processing for table verification', {
          maxConcurrent: appConfig.verification.maxConcurrentTables,
          totalTables: commonTables.length
        });
        
        const results = await this.processTablesInParallel(sourceConfig, targetConfig, commonTables, sessionId);
        
        for (const result of results) {
          if (result.status === "MATCH") {
            matchedTables++;
          }
          totalSourceRows += result.sourceRows;
          comparison.push(result);
        }
      } else {
        // Sequential processing (fallback for single table or when parallel is disabled)
        this.log('Using sequential processing for table verification');
        
        for (const tableName of commonTables) {
          this.log(`Processing table "${tableName}"...`);
          
          // Update progress if session ID provided
          if (sessionId) {
            const { progressService } = await import('./progress-service');
            progressService.updateProgress(sessionId, 'processing', tableName, `Verifying table: ${tableName}`);
          }
          
          try {
            const tableResult = await withTimeout(
              this.processTableVerification(sourceConfig, targetConfig, tableName),
              appConfig.verification.processingTimeout,
              `Table "${tableName}" processing`
            );
            
            if (tableResult.status === "MATCH") {
              matchedTables++;
            }
            
            totalSourceRows += tableResult.sourceRows;
            
            comparison.push({
              tableName,
              sourceRows: tableResult.sourceRows,
              targetRows: tableResult.targetRows,
              schemaMatch: tableResult.schemaMatch,
              status: tableResult.status,
              sourceColumns: tableResult.sourceColumns,
              targetColumns: tableResult.targetColumns,
              dataMappingValid: tableResult.dataMappingValid,
              dataMappingDetails: tableResult.dataMappingDetails,
            });

            // Update progress if session ID provided
            if (sessionId) {
              const { progressService } = await import('./progress-service');
              progressService.completeTable(sessionId, tableName);
            }
            
          } catch (error) {
            this.log(`Table "${tableName}" processing failed`, { 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            
            // Add failed table to comparison with error status
            comparison.push({
              tableName,
              sourceRows: 0,
              targetRows: 0,
              schemaMatch: false,
              status: "MISMATCH",
              sourceColumns: [],
              targetColumns: [],
              dataMappingValid: false,
              dataMappingDetails: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
          }
        }
      }
      
      const totalTables = commonTables.length;
      const mismatchedTables = totalTables - matchedTables;
      const overallStatus = mismatchedTables === 0 ? "SUCCESS" : "MISMATCH";
      const message = overallStatus === "SUCCESS" 
        ? "Migration Verification Completed Successfully"
        : `Migration Verification Found ${mismatchedTables} Issue${mismatchedTables > 1 ? 's' : ''}`;
      
      this.log('Verification completed', {
        overallStatus,
        totalTables,
        matchedTables,
        mismatchedTables,
        totalRows: totalSourceRows
      });
      
      return {
        summary: {
          status: overallStatus,
          message,
          completedAt: new Date().toISOString(),
          totalTables,
          matchedTables,
          mismatchedTables,
          totalRows: totalSourceRows,
        },
        comparison,
      };
    } catch (error) {
      this.log('Verification failed with error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined 
      });
      throw new Error(`Database verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processTablesInParallel(
    sourceConfig: DBConnection, 
    targetConfig: DBConnection, 
    tableNames: string[],
    sessionId?: string
  ): Promise<TableComparison[]> {
    const concurrency = Math.min(appConfig.verification.maxConcurrentTables, tableNames.length);
    const results: TableComparison[] = [];
    const processing: Promise<void>[] = [];
    let currentIndex = 0;

    const processTable = async (): Promise<void> => {
      while (currentIndex < tableNames.length) {
        const tableName = tableNames[currentIndex++];
        
        try {
          this.log(`Processing table "${tableName}" (parallel)...`);
          
          // Update progress if session ID provided
          if (sessionId) {
            const { progressService } = await import('./progress-service');
            progressService.updateProgress(sessionId, 'processing', tableName, `Verifying table: ${tableName} (parallel)`);
          }
          
          const tableResult = await withTimeout(
            this.processTableVerification(sourceConfig, targetConfig, tableName),
            appConfig.verification.processingTimeout,
            `Table "${tableName}" processing`
          );
          
          results.push({
            tableName,
            sourceRows: tableResult.sourceRows,
            targetRows: tableResult.targetRows,
            schemaMatch: tableResult.schemaMatch,
            status: tableResult.status,
            sourceColumns: tableResult.sourceColumns,
            targetColumns: tableResult.targetColumns,
            dataMappingValid: tableResult.dataMappingValid,
            dataMappingDetails: tableResult.dataMappingDetails,
          });

          // Update progress if session ID provided
          if (sessionId) {
            const { progressService } = await import('./progress-service');
            progressService.completeTable(sessionId, tableName);
          }
          
        } catch (error) {
          this.log(`Table "${tableName}" processing failed (parallel)`, { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          
          results.push({
            tableName,
            sourceRows: 0,
            targetRows: 0,
            schemaMatch: false,
            status: "MISMATCH",
            sourceColumns: [],
            targetColumns: [],
            dataMappingValid: false,
            dataMappingDetails: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    };

    // Start concurrent processing
    for (let i = 0; i < concurrency; i++) {
      processing.push(processTable());
    }

    await Promise.all(processing);
    
    // Sort results to maintain original table order
    return results.sort((a, b) => {
      const indexA = tableNames.indexOf(a.tableName);
      const indexB = tableNames.indexOf(b.tableName);
      return indexA - indexB;
    });
  }

  private async processTableVerification(sourceConfig: DBConnection, targetConfig: DBConnection, tableName: string) {
    const sourceRows = await this.getTableRowCount(sourceConfig, tableName);
    const targetRows = await this.getTableRowCount(targetConfig, tableName);
    const sourceColumns = await this.getTableSchema(sourceConfig, tableName);
    const targetColumns = await this.getTableSchema(targetConfig, tableName);
    
    const schemaMatch = this.compareSchemas(sourceColumns, targetColumns);
    const rowsMatch = sourceRows === targetRows;
    
    // Perform data mapping verification for matched tables
    let dataMappingResult = { isValid: true, details: "Not verified" };
    if (schemaMatch && rowsMatch) {
      dataMappingResult = await this.verifyDataMapping(sourceConfig, targetConfig, tableName, appConfig.verification.sampleDataSize);
    }
    
    const status = schemaMatch && rowsMatch && dataMappingResult.isValid ? "MATCH" : "MISMATCH";
    
    this.log(`Table "${tableName}" verification result`, {
      sourceRows,
      targetRows,
      rowsMatch,
      schemaMatch,
      dataMappingValid: dataMappingResult.isValid,
      dataMappingDetails: dataMappingResult.details,
      status
    });
    
    return {
      sourceRows,
      targetRows,
      schemaMatch,
      status,
      sourceColumns,
      targetColumns,
      dataMappingValid: dataMappingResult.isValid,
      dataMappingDetails: dataMappingResult.details,
    };
  }
}

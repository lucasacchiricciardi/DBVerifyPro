import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import type { DBConnection, Column } from "@shared/schema";

interface SQLiteConnectionInfo {
  database: sqlite3.Database;
  path: string;
  lastUsed: number;
}

export class SQLiteConnectionManager {
  private connections: Map<string, SQLiteConnectionInfo> = new Map();
  private connectionTimeout = 30000; // 30 seconds
  
  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SQLiteManager] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  private convertFileDataToBuffer(fileData: any): Buffer {
    if (fileData instanceof ArrayBuffer) {
      return Buffer.from(fileData);
    } else if (Array.isArray(fileData)) {
      return Buffer.from(fileData);
    } else if (typeof fileData === 'string') {
      return Buffer.from(fileData, 'base64');
    } else {
      throw new Error('Unsupported file data format');
    }
  }

  private async createTempFileFromData(config: DBConnection): Promise<string> {
    if (!config.fileData) {
      throw new Error('No file data provided');
    }

    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.db`);
    const buffer = this.convertFileDataToBuffer(config.fileData);
    
    fs.writeFileSync(tempPath, buffer);
    this.log('Temporary SQLite file created', { path: tempPath, size: buffer.length });
    
    return tempPath;
  }

  private getConnectionKey(dbPath: string): string {
    return path.resolve(dbPath);
  }

  async getConnection(config: DBConnection): Promise<{ db: sqlite3.Database; path: string }> {
    let dbPath = config.filePath;
    
    // Handle uploaded file data
    if (config.fileData) {
      dbPath = await this.createTempFileFromData(config);
    }
    
    if (!dbPath) {
      throw new Error('SQLite file path or file data is required');
    }
    
    if (!fs.existsSync(dbPath)) {
      throw new Error(`SQLite file does not exist: ${dbPath}`);
    }

    const connectionKey = this.getConnectionKey(dbPath);
    const existingConnection = this.connections.get(connectionKey);
    
    // Check if existing connection is still valid
    if (existingConnection && (Date.now() - existingConnection.lastUsed) < this.connectionTimeout) {
      existingConnection.lastUsed = Date.now();
      this.log('Reusing existing SQLite connection', { path: dbPath });
      return { db: existingConnection.database, path: dbPath };
    }
    
    // Close existing connection if it exists
    if (existingConnection) {
      existingConnection.database.close();
      this.connections.delete(connectionKey);
      this.log('Closed expired SQLite connection', { path: dbPath });
    }
    
    // Create new connection
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          this.log('SQLite connection failed', { path: dbPath, error: err.message });
          reject(new Error(`SQLite connection failed: ${err.message}`));
          return;
        }
        
        this.log('New SQLite connection created', { path: dbPath });
        
        // Store connection
        this.connections.set(connectionKey, {
          database: db,
          path: dbPath,
          lastUsed: Date.now()
        });
        
        resolve({ db, path: dbPath });
      });
    });
  }

  async executeQuery<T = any>(config: DBConnection, query: string, params: any[] = []): Promise<T[]> {
    const { db } = await this.getConnection(config);
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows: T[]) => {
        if (err) {
          this.log('SQLite query failed', { query, error: err.message });
          reject(new Error(`SQLite query failed: ${err.message}`));
          return;
        }
        
        this.log('SQLite query executed', { query, rowCount: rows.length });
        resolve(rows);
      });
    });
  }

  async getFirst<T = any>(config: DBConnection, query: string, params: any[] = []): Promise<T | null> {
    const { db } = await this.getConnection(config);
    
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row: T) => {
        if (err) {
          this.log('SQLite query failed', { query, error: err.message });
          reject(new Error(`SQLite query failed: ${err.message}`));
          return;
        }
        
        this.log('SQLite query executed', { query, hasResult: !!row });
        resolve(row || null);
      });
    });
  }

  async testConnection(config: DBConnection): Promise<void> {
    this.log('Testing SQLite connection...');
    
    const { db } = await this.getConnection(config);
    
    return new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", (err) => {
        if (err) {
          this.log('SQLite connection test failed', { error: err.message });
          reject(new Error(`SQLite database error: ${err.message}`));
          return;
        }
        
        this.log('SQLite connection test successful');
        resolve();
      });
    });
  }

  async getTables(config: DBConnection): Promise<string[]> {
    this.log('Getting SQLite tables...');
    
    const query = `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `;
    
    const rows = await this.executeQuery<{ name: string }>(config, query);
    const tables = rows.map(row => row.name);
    
    this.log('SQLite tables retrieved', { count: tables.length, tables });
    return tables;
  }

  async getTableRowCount(config: DBConnection, tableName: string): Promise<number> {
    this.log(`Getting row count for SQLite table "${tableName}"`);
    
    const query = `SELECT COUNT(*) as count FROM "${tableName}"`;
    const result = await this.getFirst<{ count: number }>(config, query);
    
    const count = result?.count || 0;
    this.log(`Table "${tableName}" row count`, { count });
    return count;
  }

  async getTableSchema(config: DBConnection, tableName: string): Promise<Column[]> {
    this.log(`Getting schema for SQLite table "${tableName}"`);
    
    const query = `PRAGMA table_info("${tableName}")`;
    const rows = await this.executeQuery<any>(config, query);
    
    const columns: Column[] = rows.map(row => ({
      name: row.name,
      type: row.type || 'TEXT',
      nullable: row.notnull === 0
    }));
    
    this.log('SQLite table schema retrieved', { table: tableName, columns: columns.length });
    return columns;
  }

  async getSampleData(config: DBConnection, tableName: string, sampleSize: number): Promise<any[]> {
    this.log(`Getting sample data from SQLite table "${tableName}"`);
    
    const query = `SELECT * FROM "${tableName}" LIMIT ?`;
    const rows = await this.executeQuery(config, query, [sampleSize]);
    
    this.log('SQLite sample data retrieved', { table: tableName, rows: rows.length });
    return rows;
  }

  closeConnection(dbPath: string): void {
    const connectionKey = this.getConnectionKey(dbPath);
    const connection = this.connections.get(connectionKey);
    
    if (connection) {
      connection.database.close((err) => {
        if (err) {
          this.log('Error closing SQLite connection', { path: dbPath, error: err.message });
        } else {
          this.log('SQLite connection closed', { path: dbPath });
        }
      });
      this.connections.delete(connectionKey);
    }
  }

  closeAllConnections(): void {
    this.log('Closing all SQLite connections', { count: this.connections.size });
    
    for (const [key, connection] of this.connections.entries()) {
      connection.database.close((err) => {
        if (err) {
          this.log('Error closing SQLite connection', { key, error: err.message });
        }
      });
    }
    
    this.connections.clear();
  }

  closeConnectionsByRole(databaseRole: string): void {
    this.log(`Closing SQLite connections for role: ${databaseRole}`, { activeConnections: this.connections.size });
    
    const connectionsToClose: string[] = [];
    
    for (const [key, connection] of this.connections.entries()) {
      // Check if this connection's path contains the role prefix
      if (key.includes(`${databaseRole}_`)) {
        connection.database.close((err) => {
          if (err) {
            this.log('Error closing SQLite connection for role', { 
              key, 
              databaseRole,
              error: err.message 
            });
          } else {
            this.log('Closed SQLite connection for role', { key, databaseRole });
          }
        });
        connectionsToClose.push(key);
      }
    }
    
    // Remove closed connections from the map
    for (const key of connectionsToClose) {
      this.connections.delete(key);
    }
    
    this.log(`Closed ${connectionsToClose.length} SQLite connections for role ${databaseRole}`);
  }

  // Cleanup expired connections
  cleanupExpiredConnections(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, connection] of this.connections.entries()) {
      if (now - connection.lastUsed > this.connectionTimeout) {
        expiredKeys.push(key);
      }
    }
    
    if (expiredKeys.length > 0) {
      this.log('Cleaning up expired connections', { count: expiredKeys.length });
      
      for (const key of expiredKeys) {
        const connection = this.connections.get(key);
        if (connection) {
          connection.database.close();
          this.connections.delete(key);
        }
      }
    }
  }
}

// Singleton instance
export const sqliteManager = new SQLiteConnectionManager();

// Cleanup expired connections every 5 minutes
setInterval(() => {
  sqliteManager.cleanupExpiredConnections();
}, 5 * 60 * 1000);
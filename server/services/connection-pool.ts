/**
 * Connection pool manager for database connections
 * Implements connection pooling with lifecycle management
 */

import mysql from 'mysql2/promise';
import { Client as PostgreSQLClient } from 'pg';
import { DBConnection } from '@shared/schema';
import { appConfig } from '../config/app-config';
import { DatabaseError, logError } from '../utils/error-handler';

interface PooledConnection {
  connection: mysql.Connection | PostgreSQLClient;
  type: 'mysql' | 'postgres';
  lastUsed: number;
  inUse: boolean;
  config: DBConnection;
}

export class ConnectionPool {
  private pools: Map<string, PooledConnection[]> = new Map();
  private activeConnections = 0;
  private maxConnections = appConfig.database.maxConcurrentConnections;

  private log(message: string, data?: any): void {
    if (appConfig.logging.enableStructuredLogging) {
      console.log(`[${new Date().toISOString()}] [ConnectionPool] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    } else {
      console.log(`[ConnectionPool] ${message}`, data || '');
    }
  }

  private getPoolKey(config: DBConnection): string {
    return `${config.type}:${config.host}:${config.port}:${config.database}:${config.user}`;
  }

  async getConnection(config: DBConnection): Promise<mysql.Connection | PostgreSQLClient> {
    try {
      const poolKey = this.getPoolKey(config);
      
      // Try to get an existing connection from the pool
      const availableConnection = this.getAvailableConnection(poolKey);
      if (availableConnection) {
        availableConnection.inUse = true;
        availableConnection.lastUsed = Date.now();
        this.log('Reusing pooled connection', { poolKey, activeConnections: this.activeConnections });
        return availableConnection.connection;
      }

      // Check connection limits
      if (this.activeConnections >= this.maxConnections) {
        throw new DatabaseError(
          'Connection pool exhausted',
          'RESOURCE_EXHAUSTED',
          { activeConnections: this.activeConnections, maxConnections: this.maxConnections }
        );
      }

      // Create new connection
      const connection = await this.createConnection(config);
      const pooledConnection: PooledConnection = {
        connection,
        type: config.type as 'mysql' | 'postgres',
        lastUsed: Date.now(),
        inUse: true,
        config
      };

      // Add to pool
      if (!this.pools.has(poolKey)) {
        this.pools.set(poolKey, []);
      }
      this.pools.get(poolKey)!.push(pooledConnection);
      this.activeConnections++;

      this.log('Created new pooled connection', { 
        poolKey, 
        activeConnections: this.activeConnections,
        type: config.type 
      });

      return connection;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown connection error'), 
               { poolKey: this.getPoolKey(config), activeConnections: this.activeConnections });
      throw error;
    }
  }

  private getAvailableConnection(poolKey: string): PooledConnection | null {
    const pool = this.pools.get(poolKey);
    if (!pool) return null;

    return pool.find(conn => !conn.inUse && this.isConnectionValid(conn)) || null;
  }

  private isConnectionValid(pooledConnection: PooledConnection): boolean {
    const maxAge = 300000; // 5 minutes
    const age = Date.now() - pooledConnection.lastUsed;
    return age < maxAge;
  }

  private async createConnection(config: DBConnection): Promise<mysql.Connection | PostgreSQLClient> {
    if (config.type === 'mysql') {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        timeout: appConfig.database.connectionTimeout,
        acquireTimeout: appConfig.database.connectionTimeout,
        connectionLimit: 1,
      });

      // Test the connection
      await connection.ping();
      return connection;
    }

    if (config.type === 'postgres') {
      const client = new PostgreSQLClient({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: { rejectUnauthorized: false },
        query_timeout: appConfig.database.queryTimeout,
        connection_timeout: appConfig.database.connectionTimeout,
      });

      await client.connect();
      return client;
    }

    throw new DatabaseError(`Unsupported database type: ${config.type}`, 'INVALID_DATABASE_TYPE');
  }

  async releaseConnection(connection: mysql.Connection | PostgreSQLClient): Promise<void> {
    // Find the pooled connection
    for (const [poolKey, pool] of this.pools.entries()) {
      const pooledConnection = pool.find(pc => pc.connection === connection);
      if (pooledConnection) {
        pooledConnection.inUse = false;
        pooledConnection.lastUsed = Date.now();
        this.log('Released connection back to pool', { poolKey });
        return;
      }
    }

    this.log('Connection not found in pool, closing directly');
    await this.closeConnection(connection);
  }

  private async closeConnection(connection: mysql.Connection | PostgreSQLClient): Promise<void> {
    try {
      if ('end' in connection) {
        await connection.end();
      } else if ('close' in connection) {
        await connection.end();
      }
    } catch (error) {
      this.log('Error closing connection', { error: (error as Error).message });
    }
  }

  async closePool(poolKey?: string): Promise<void> {
    if (poolKey) {
      const pool = this.pools.get(poolKey);
      if (pool) {
        await Promise.all(pool.map(pc => this.closeConnection(pc.connection)));
        this.activeConnections -= pool.length;
        this.pools.delete(poolKey);
        this.log('Closed specific connection pool', { poolKey });
      }
    } else {
      // Close all pools
      for (const [key, pool] of this.pools.entries()) {
        await Promise.all(pool.map(pc => this.closeConnection(pc.connection)));
        this.log('Closed connection pool', { poolKey: key, connections: pool.length });
      }
      this.pools.clear();
      this.activeConnections = 0;
      this.log('Closed all connection pools');
    }
  }

  cleanupExpiredConnections(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [poolKey, pool] of this.pools.entries()) {
      const validConnections: PooledConnection[] = [];
      const expiredConnections: PooledConnection[] = [];

      pool.forEach(pc => {
        if (!pc.inUse && (now - pc.lastUsed) > maxAge) {
          expiredConnections.push(pc);
        } else {
          validConnections.push(pc);
        }
      });

      if (expiredConnections.length > 0) {
        this.log('Cleaning up expired connections', { 
          poolKey, 
          expired: expiredConnections.length,
          remaining: validConnections.length 
        });

        // Close expired connections
        expiredConnections.forEach(pc => {
          this.closeConnection(pc.connection);
          this.activeConnections--;
        });

        // Update pool
        this.pools.set(poolKey, validConnections);
      }
    }
  }

  getPoolStats(): Record<string, any> {
    const stats: Record<string, any> = {
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      pools: {}
    };

    for (const [poolKey, pool] of this.pools.entries()) {
      const inUse = pool.filter(pc => pc.inUse).length;
      const available = pool.filter(pc => !pc.inUse).length;
      
      stats.pools[poolKey] = {
        total: pool.length,
        inUse,
        available
      };
    }

    return stats;
  }
}

// Global connection pool instance
export const connectionPool = new ConnectionPool();

// Cleanup interval
setInterval(() => {
  connectionPool.cleanupExpiredConnections();
}, 60000); // Every minute
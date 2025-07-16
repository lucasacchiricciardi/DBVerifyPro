/**
 * Schema caching service for performance optimization
 * Reduces redundant database schema queries
 */

import type { DBConnection, Column } from '@shared/schema';
import { appConfig } from '../config/app-config';

interface CacheEntry {
  schema: Column[];
  timestamp: number;
  connectionKey: string;
}

export class SchemaCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL = 300000; // 5 minutes cache TTL

  private log(message: string, data?: any): void {
    if (appConfig.logging.enableStructuredLogging) {
      console.log(`[${new Date().toISOString()}] [SchemaCache] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    } else {
      console.log(`[SchemaCache] ${message}`, data || '');
    }
  }

  private getCacheKey(config: DBConnection, tableName: string): string {
    return `${config.type}:${config.host}:${config.port}:${config.database}:${tableName}`;
  }

  private getConnectionKey(config: DBConnection): string {
    return `${config.type}:${config.host}:${config.port}:${config.database}`;
  }

  get(config: DBConnection, tableName: string): Column[] | null {
    const key = this.getCacheKey(config, tableName);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    const age = Date.now() - entry.timestamp;
    if (age > this.TTL) {
      this.cache.delete(key);
      this.log('Cache entry expired and removed', { tableName, age });
      return null;
    }

    this.log('Cache hit for table schema', { tableName, age });
    return entry.schema;
  }

  set(config: DBConnection, tableName: string, schema: Column[]): void {
    const key = this.getCacheKey(config, tableName);
    const connectionKey = this.getConnectionKey(config);

    const entry: CacheEntry = {
      schema: [...schema], // Create a copy to avoid mutations
      timestamp: Date.now(),
      connectionKey
    };

    this.cache.set(key, entry);
    this.log('Schema cached for table', { tableName, columns: schema.length });
  }

  invalidate(config: DBConnection, tableName?: string): void {
    if (tableName) {
      // Invalidate specific table
      const key = this.getCacheKey(config, tableName);
      const wasDeleted = this.cache.delete(key);
      this.log('Invalidated table schema cache', { tableName, found: wasDeleted });
    } else {
      // Invalidate all tables for this connection
      const connectionKey = this.getConnectionKey(config);
      let removedCount = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.connectionKey === connectionKey) {
          this.cache.delete(key);
          removedCount++;
        }
      }

      this.log('Invalidated connection schema cache', { connectionKey, removedCount });
    }
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.log('Cleared all schema cache', { removedCount: size });
  }

  cleanupExpired(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.TTL) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.log('Cleaned up expired cache entries', { removedCount });
    }
  }

  getStats(): Record<string, any> {
    const stats = {
      totalEntries: this.cache.size,
      connections: new Set<string>(),
      oldestEntry: 0,
      newestEntry: 0
    };

    const now = Date.now();
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      stats.connections.add(entry.connectionKey);
      
      const age = now - entry.timestamp;
      if (age > oldestAge) oldestAge = age;
      if (age < newestAge) newestAge = age;
    }

    stats.oldestEntry = oldestAge;
    stats.newestEntry = newestAge === Infinity ? 0 : newestAge;

    return {
      ...stats,
      connections: stats.connections.size
    };
  }
}

// Global schema cache instance
export const schemaCache = new SchemaCache();

// Cleanup interval
setInterval(() => {
  schemaCache.cleanupExpired();
}, 60000); // Every minute
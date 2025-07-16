// Enhanced local storage utilities with comprehensive error handling and validation
// Supports MySQL, PostgreSQL, and SQLite connection persistence

const STORAGE_KEYS = {
  SOURCE_CONNECTION: 'db-verify-source-connection',
  TARGET_CONNECTION: 'db-verify-target-connection',
  LAST_VERIFICATION: 'db-verify-last-verification',
  USER_PREFERENCES: 'db-verify-user-preferences',
  APP_SETTINGS: 'db-verify-app-settings'
} as const;

export interface StoredConnection {
  type: 'mysql' | 'postgres' | 'sqlite';
  host: string;
  port: number;
  user: string;
  database: string;
  password?: string; // WARNING: Storing passwords in localStorage is NOT SECURE
  // SQLite specific fields
  fileId?: string;
  fileName?: string;
  filePath?: string;
  // Metadata
  lastUsed?: string;
  version?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  savePasswords: boolean;
  autoSaveConnections: boolean;
  defaultSampleSize: number;
}

export interface AppSettings {
  maxRecentConnections: number;
  connectionTimeout: number;
  enableAdvancedLogging: boolean;
  performanceMode: boolean;
}

// Storage error types
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly key?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// Check if localStorage is available and functional
export function isStorageAvailable(): boolean {
  try {
    const testKey = '__db-verify-storage-test__';
    const testValue = 'test';
    localStorage.setItem(testKey, testValue);
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    return retrieved === testValue;
  } catch (error) {
    console.warn('localStorage is not available:', error);
    return false;
  }
}

// Get storage quota information
export function getStorageInfo(): { used: number; quota: number; available: number } | null {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        console.log('Storage quota:', estimate);
      });
    }
    
    // Fallback: estimate used storage
    let used = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }
    
    return {
      used,
      quota: 5 * 1024 * 1024, // Typical 5MB limit
      available: (5 * 1024 * 1024) - used
    };
  } catch (error) {
    console.warn('Unable to get storage info:', error);
    return null;
  }
}

// Validate connection data structure
function validateStoredConnection(data: unknown): data is StoredConnection {
  if (!data || typeof data !== 'object') return false;
  
  const conn = data as Record<string, unknown>;
  
  // Required fields
  if (!conn.type || !['mysql', 'postgres', 'sqlite'].includes(conn.type as string)) return false;
  if (typeof conn.host !== 'string') return false;
  if (typeof conn.port !== 'number' || conn.port < 1 || conn.port > 65535) return false;
  if (typeof conn.user !== 'string') return false;
  if (typeof conn.database !== 'string') return false;
  
  // Optional fields validation
  if (conn.password !== undefined && typeof conn.password !== 'string') return false;
  if (conn.fileId !== undefined && typeof conn.fileId !== 'string') return false;
  if (conn.fileName !== undefined && typeof conn.fileName !== 'string') return false;
  if (conn.filePath !== undefined && typeof conn.filePath !== 'string') return false;
  if (conn.lastUsed !== undefined && typeof conn.lastUsed !== 'string') return false;
  if (conn.version !== undefined && typeof conn.version !== 'string') return false;
  
  return true;
}

// Enhanced save connection with comprehensive error handling and validation
export function saveConnectionToStorage(
  key: keyof typeof STORAGE_KEYS, 
  connection: StoredConnection, 
  includePassword: boolean = false
): { success: boolean; error?: StorageError } {
  // Validate storage availability
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Connection cannot be saved.',
      'save',
      key
    );
    console.error(error.message);
    return { success: false, error };
  }
  
  try {
    // Validate connection data
    if (!validateStoredConnection(connection)) {
      throw new StorageError(
        'Invalid connection data structure',
        'validation',
        key
      );
    }
    
    console.log(`Saving ${key} connection to localStorage`, { 
      type: connection.type, 
      host: connection.host, 
      database: connection.database,
      includePassword,
      isSQLite: connection.type === 'sqlite'
    });
    
    // Create connection object to store with enhanced metadata
    const connectionToStore: StoredConnection = {
      type: connection.type,
      host: connection.host,
      port: connection.port,
      user: connection.user,
      database: connection.database,
      lastUsed: new Date().toISOString(),
      version: '2.0' // Storage format version
    };
    
    // Include SQLite-specific fields
    if (connection.type === 'sqlite') {
      if (connection.fileId) connectionToStore.fileId = connection.fileId;
      if (connection.fileName) connectionToStore.fileName = connection.fileName;
      if (connection.filePath) connectionToStore.filePath = connection.filePath;
    }
    
    // Include password only if explicitly requested (NOT SECURE!)
    if (includePassword && connection.password) {
      connectionToStore.password = connection.password;
      console.warn('⚠️ WARNING: Storing password in localStorage is NOT SECURE and should only be used for development/testing!');
    }
    
    // Check storage quota before saving
    const storageInfo = getStorageInfo();
    const dataSize = JSON.stringify(connectionToStore).length;
    
    if (storageInfo && dataSize > storageInfo.available) {
      throw new StorageError(
        `Insufficient storage space. Required: ${dataSize} bytes, Available: ${storageInfo.available} bytes`,
        'quota',
        key
      );
    }
    
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(connectionToStore));
    
    console.log(`Successfully saved ${key} connection (${dataSize} bytes)`);
    return { success: true };
    
  } catch (error) {
    const storageError = error instanceof StorageError ? error : new StorageError(
      `Failed to save ${key} connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'save',
      key,
      error instanceof Error ? error : undefined
    );
    
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// Enhanced load connection with validation and error recovery
export function loadConnectionFromStorage(
  key: keyof typeof STORAGE_KEYS
): { success: boolean; data?: StoredConnection; error?: StorageError } {
  // Validate storage availability
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot load connection.',
      'load',
      key
    );
    console.warn(error.message);
    return { success: false, error };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[key]);
    if (!stored) {
      console.log(`No ${key} found in localStorage`);
      return { success: true, data: undefined };
    }
    
    // Parse and validate JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch (parseError) {
      throw new StorageError(
        `Invalid JSON data for ${key}`,
        'parse',
        key,
        parseError instanceof Error ? parseError : undefined
      );
    }
    
    // Validate data structure
    if (!validateStoredConnection(parsed)) {
      console.warn(`Invalid connection data structure for ${key}, clearing corrupted data`);
      localStorage.removeItem(STORAGE_KEYS[key]);
      throw new StorageError(
        `Corrupted connection data for ${key} (data cleared)`,
        'validation',
        key
      );
    }
    
    const connection = parsed as StoredConnection;
    
    // Handle version migrations if needed
    if (!connection.version || connection.version !== '2.0') {
      console.log(`Migrating ${key} to current storage format`);
      // Auto-save with current version
      saveConnectionToStorage(key, { ...connection, version: '2.0' });
    }
    
    console.log(`Successfully loaded ${key} from localStorage:`, {
      type: connection.type,
      host: connection.host,
      database: connection.database,
      hasPassword: !!connection.password,
      isSQLite: connection.type === 'sqlite',
      lastUsed: connection.lastUsed
    });
    
    return { success: true, data: connection };
    
  } catch (error) {
    const storageError = error instanceof StorageError ? error : new StorageError(
      `Failed to load ${key} connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'load',
      key,
      error instanceof Error ? error : undefined
    );
    
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// Enhanced clear connection with error handling
export function clearConnectionFromStorage(
  key: keyof typeof STORAGE_KEYS
): { success: boolean; error?: StorageError } {
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot clear connection.',
      'clear',
      key
    );
    console.warn(error.message);
    return { success: false, error };
  }
  
  try {
    localStorage.removeItem(STORAGE_KEYS[key]);
    console.log(`Successfully cleared ${key} from localStorage`);
    return { success: true };
  } catch (error) {
    const storageError = new StorageError(
      `Failed to clear ${key} from localStorage`,
      'clear',
      key,
      error instanceof Error ? error : undefined
    );
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// Enhanced clear all stored data with detailed feedback
export function clearAllStoredData(): { 
  success: boolean; 
  cleared: string[]; 
  failed: Array<{ key: string; error: StorageError }> 
} {
  const cleared: string[] = [];
  const failed: Array<{ key: string; error: StorageError }> = [];
  
  Object.entries(STORAGE_KEYS).forEach(([keyName, keyValue]) => {
    const result = clearConnectionFromStorage(keyName as keyof typeof STORAGE_KEYS);
    if (result.success) {
      cleared.push(keyName);
    } else if (result.error) {
      failed.push({ key: keyName, error: result.error });
    }
  });
  
  console.log('Storage cleanup completed:', { cleared: cleared.length, failed: failed.length });
  return { success: failed.length === 0, cleared, failed };
}

// Enhanced save last verification timestamp
export function saveLastVerificationTime(): { success: boolean; error?: StorageError } {
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot save verification time.',
      'save',
      'LAST_VERIFICATION'
    );
    return { success: false, error };
  }
  
  try {
    const timestamp = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.LAST_VERIFICATION, timestamp);
    console.log('Saved last verification time:', timestamp);
    return { success: true };
  } catch (error) {
    const storageError = new StorageError(
      'Failed to save last verification time',
      'save',
      'LAST_VERIFICATION',
      error instanceof Error ? error : undefined
    );
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// Enhanced get last verification timestamp
export function getLastVerificationTime(): { 
  success: boolean; 
  data?: Date; 
  error?: StorageError 
} {
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot get verification time.',
      'load',
      'LAST_VERIFICATION'
    );
    return { success: false, error };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LAST_VERIFICATION);
    if (!stored) {
      return { success: true, data: undefined };
    }
    
    const date = new Date(stored);
    if (isNaN(date.getTime())) {
      throw new StorageError(
        'Invalid date format in stored verification time',
        'parse',
        'LAST_VERIFICATION'
      );
    }
    
    return { success: true, data: date };
  } catch (error) {
    const storageError = error instanceof StorageError ? error : new StorageError(
      'Failed to get last verification time',
      'load',
      'LAST_VERIFICATION',
      error instanceof Error ? error : undefined
    );
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// User preferences management
export function saveUserPreferences(preferences: UserPreferences): { success: boolean; error?: StorageError } {
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot save preferences.',
      'save',
      'USER_PREFERENCES'
    );
    return { success: false, error };
  }
  
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
    console.log('Saved user preferences:', preferences);
    return { success: true };
  } catch (error) {
    const storageError = new StorageError(
      'Failed to save user preferences',
      'save',
      'USER_PREFERENCES',
      error instanceof Error ? error : undefined
    );
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

export function loadUserPreferences(): { 
  success: boolean; 
  data?: UserPreferences; 
  error?: StorageError 
} {
  if (!isStorageAvailable()) {
    const error = new StorageError(
      'localStorage is not available. Cannot load preferences.',
      'load',
      'USER_PREFERENCES'
    );
    return { success: false, error };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    if (!stored) {
      // Return default preferences
      const defaultPreferences: UserPreferences = {
        theme: 'system',
        language: 'en',
        savePasswords: false,
        autoSaveConnections: true,
        defaultSampleSize: 100
      };
      return { success: true, data: defaultPreferences };
    }
    
    const preferences = JSON.parse(stored) as UserPreferences;
    return { success: true, data: preferences };
  } catch (error) {
    const storageError = new StorageError(
      'Failed to load user preferences',
      'load',
      'USER_PREFERENCES',
      error instanceof Error ? error : undefined
    );
    console.error(storageError.message, storageError.originalError);
    return { success: false, error: storageError };
  }
}

// Storage diagnostics and health check
export function runStorageDiagnostics(): {
  available: boolean;
  quota: { used: number; quota: number; available: number } | null;
  keys: string[];
  errors: StorageError[];
  recommendations: string[];
} {
  const errors: StorageError[] = [];
  const recommendations: string[] = [];
  const available = isStorageAvailable();
  const quota = getStorageInfo();
  
  // Check each stored key
  const keys: string[] = [];
  Object.values(STORAGE_KEYS).forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        keys.push(key);
      }
    } catch (error) {
      errors.push(new StorageError(
        `Cannot access key: ${key}`,
        'access',
        key,
        error instanceof Error ? error : undefined
      ));
    }
  });
  
  // Generate recommendations
  if (!available) {
    recommendations.push('localStorage is not available - check browser settings or private browsing mode');
  }
  
  if (quota && quota.available < 1024 * 100) { // Less than 100KB available
    recommendations.push('Storage quota is nearly full - consider clearing old data');
  }
  
  if (errors.length > 0) {
    recommendations.push('Storage errors detected - consider clearing corrupted data');
  }
  
  return {
    available,
    quota,
    keys,
    errors,
    recommendations
  };
}
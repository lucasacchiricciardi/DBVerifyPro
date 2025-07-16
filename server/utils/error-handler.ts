/**
 * Enhanced Error Handling Utilities
 * Provides structured error handling with security considerations
 */

/**
 * Custom error classes for different error types
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class SecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class FileError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FileError';
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public timeoutMs: number,
    public operation?: string
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = 'Operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `${operation} timed out after ${timeoutMs}ms`,
        timeoutMs,
        operation
      ));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

/**
 * Sanitize error messages for public consumption
 * Removes sensitive information while preserving useful debugging info
 */
export function sanitizeErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();
  
  // Remove potentially sensitive information
  let sanitized = error.message
    .replace(/password\s*[:=]\s*[^\s]+/gi, 'password: [REDACTED]')
    .replace(/token\s*[:=]\s*[^\s]+/gi, 'token: [REDACTED]')
    .replace(/key\s*[:=]\s*[^\s]+/gi, 'key: [REDACTED]')
    .replace(/secret\s*[:=]\s*[^\s]+/gi, 'secret: [REDACTED]')
    .replace(/\/[a-z]:[^\/\s]*/gi, '[PATH_REDACTED]'); // Remove file paths
  
  // Provide user-friendly alternatives for common database errors
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return 'Database connection refused. Please check if the database server is running and accessible.';
  }
  
  if (message.includes('enotfound') || message.includes('getaddrinfo')) {
    return 'Database host not found. Please verify the hostname or IP address.';
  }
  
  if (message.includes('etimedout') || message.includes('timeout')) {
    return 'Database connection timed out. Please check network connectivity and firewall settings.';
  }
  
  if (message.includes('access denied') || message.includes('authentication failed')) {
    return 'Database authentication failed. Please verify your username and password.';
  }
  
  if (message.includes('database') && message.includes('does not exist')) {
    return 'The specified database does not exist. Please verify the database name.';
  }
  
  if (message.includes('permission denied') || message.includes('insufficient privileges')) {
    return 'Insufficient database permissions. Please check user privileges.';
  }
  
  return sanitized;
}

/**
 * Get error category for monitoring and analytics
 */
export function categorizeError(error: Error): string {
  const message = error.message.toLowerCase();
  
  if (error instanceof TimeoutError) return 'TIMEOUT';
  if (error instanceof SecurityError) return 'SECURITY';
  if (error instanceof FileError) return 'FILE';
  if (error instanceof DatabaseError) return 'DATABASE';
  
  // Auto-categorize based on message content
  if (message.includes('connection') || message.includes('connect')) return 'CONNECTION';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('permission') || message.includes('access')) return 'PERMISSION';
  if (message.includes('validation') || message.includes('invalid')) return 'VALIDATION';
  if (message.includes('file') || message.includes('upload')) return 'FILE';
  if (message.includes('sql') || message.includes('query')) return 'DATABASE';
  
  return 'UNKNOWN';
}

/**
 * Create structured error response
 */
export function createErrorResponse(
  error: Error,
  requestId?: string,
  includeStack: boolean = false
) {
  const category = categorizeError(error);
  const sanitizedMessage = sanitizeErrorMessage(error);
  
  return {
    success: false,
    error: {
      code: category,
      message: sanitizedMessage,
      category,
      ...(includeStack && { stack: error.stack }),
      ...(error instanceof DatabaseError && { details: error.details }),
      ...(error instanceof SecurityError && { details: error.details }),
      ...(error instanceof FileError && { details: error.details }),
      ...(error instanceof TimeoutError && { 
        details: { 
          timeoutMs: error.timeoutMs, 
          operation: error.operation 
        } 
      }),
    },
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log error with structured data
 */
export function logError(
  error: Error,
  context: any = {},
  requestId?: string
): void {
  const timestamp = new Date().toISOString();
  const category = categorizeError(error);
  
  console.error(`[${timestamp}] [ERROR] [${category}] ${error.message}`, {
    requestId,
    category,
    name: error.name,
    stack: error.stack,
    context,
  });
}
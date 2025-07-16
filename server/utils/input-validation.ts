/**
 * Enhanced Input Validation and Sanitization Utilities
 * Provides comprehensive security validation for all user inputs
 */

import { z } from 'zod';
import validator from 'validator';
import xss from 'xss';

// Security configuration
const SECURITY_CONFIG = {
  // Database connection limits
  MAX_DATABASE_NAME_LENGTH: 64,
  MAX_USERNAME_LENGTH: 64,
  MAX_HOST_LENGTH: 253, // RFC compliant hostname max length
  MIN_PORT: 1,
  MAX_PORT: 65535,
  
  // File upload limits
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  ALLOWED_SQLITE_EXTENSIONS: ['.db', '.sqlite', '.sqlite3'],
  
  // SQL injection patterns to detect (excluding valid database username characters)
  SQL_INJECTION_PATTERNS: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|;|\/\*|\*\/|xp_|sp_)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
  ],
  
  // Database username specific patterns (more permissive)
  DB_USERNAME_DANGEROUS_PATTERNS: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|;|\/\*|\*\/)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /['"\\]/g, // Only block quotes and backslashes, allow underscores and percent
  ],
  
  // XSS patterns
  XSS_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ],
};

/**
 * Custom validation errors
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    throw new ValidationError('Input must be a string', 'input', 'INVALID_TYPE');
  }
  
  // Remove XSS threats
  const sanitized = xss(input, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script'],
  });
  
  // Additional cleanup
  return sanitized
    .trim()
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
    .substring(0, 1000); // Limit length to prevent DoS
}

/**
 * Validate and sanitize database connection strings
 */
export function validateDatabaseName(name: string): string {
  const sanitized = sanitizeString(name);
  
  if (!sanitized || sanitized.length === 0) {
    throw new ValidationError('Database name cannot be empty', 'database', 'REQUIRED');
  }
  
  if (sanitized.length > SECURITY_CONFIG.MAX_DATABASE_NAME_LENGTH) {
    throw new ValidationError(
      `Database name too long (max ${SECURITY_CONFIG.MAX_DATABASE_NAME_LENGTH} characters)`,
      'database',
      'TOO_LONG'
    );
  }
  
  // Check for SQL injection patterns
  for (const pattern of SECURITY_CONFIG.SQL_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new ValidationError(
        'Database name contains potentially dangerous characters',
        'database',
        'SECURITY_VIOLATION'
      );
    }
  }
  
  // Validate database name format (alphanumeric, underscore, hyphen, and dots for file names)
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new ValidationError(
      'Database name can only contain letters, numbers, underscores, hyphens, and dots',
      'database',
      'INVALID_FORMAT'
    );
  }
  
  return sanitized;
}

/**
 * Validate username (specifically for database usernames - more permissive)
 */
export function validateUsername(username: string): string {
  const sanitized = sanitizeString(username);
  
  if (!sanitized || sanitized.length === 0) {
    throw new ValidationError('Username cannot be empty', 'username', 'REQUIRED');
  }
  
  if (sanitized.length > SECURITY_CONFIG.MAX_USERNAME_LENGTH) {
    throw new ValidationError(
      `Username too long (max ${SECURITY_CONFIG.MAX_USERNAME_LENGTH} characters)`,
      'username',
      'TOO_LONG'
    );
  }
  
  // Check for dangerous patterns specific to database usernames (more permissive)
  for (const pattern of SECURITY_CONFIG.DB_USERNAME_DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new ValidationError(
        'Username contains potentially dangerous characters',
        'username',
        'SECURITY_VIOLATION'
      );
    }
  }
  
  return sanitized;
}

/**
 * Validate hostname
 */
export function validateHostname(host: string): string {
  const sanitized = sanitizeString(host);
  
  if (!sanitized || sanitized.length === 0) {
    throw new ValidationError('Hostname cannot be empty', 'host', 'REQUIRED');
  }
  
  if (sanitized.length > SECURITY_CONFIG.MAX_HOST_LENGTH) {
    throw new ValidationError(
      `Hostname too long (max ${SECURITY_CONFIG.MAX_HOST_LENGTH} characters)`,
      'host',
      'TOO_LONG'
    );
  }
  
  // Validate hostname format
  if (!validator.isFQDN(sanitized, { allow_numeric_tld: true }) && 
      !validator.isIP(sanitized) && 
      sanitized !== 'localhost') {
    throw new ValidationError(
      'Invalid hostname format',
      'host',
      'INVALID_FORMAT'
    );
  }
  
  return sanitized;
}

/**
 * Validate port number
 */
export function validatePort(port: number): number {
  if (!Number.isInteger(port)) {
    throw new ValidationError('Port must be an integer', 'port', 'INVALID_TYPE');
  }
  
  if (port < SECURITY_CONFIG.MIN_PORT || port > SECURITY_CONFIG.MAX_PORT) {
    throw new ValidationError(
      `Port must be between ${SECURITY_CONFIG.MIN_PORT} and ${SECURITY_CONFIG.MAX_PORT}`,
      'port',
      'OUT_OF_RANGE'
    );
  }
  
  return port;
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: any, filename: string): void {
  if (!file) {
    throw new ValidationError('File is required', 'file', 'REQUIRED');
  }
  
  // Validate file size
  if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large (max ${SECURITY_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB)`,
      'file',
      'TOO_LARGE'
    );
  }
  
  // Validate file extension
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  if (!SECURITY_CONFIG.ALLOWED_SQLITE_EXTENSIONS.includes(ext)) {
    throw new ValidationError(
      `Invalid file type. Allowed extensions: ${SECURITY_CONFIG.ALLOWED_SQLITE_EXTENSIONS.join(', ')}`,
      'file',
      'INVALID_TYPE'
    );
  }
  
  // Validate filename
  const sanitizedFilename = sanitizeString(filename);
  if (sanitizedFilename !== filename) {
    throw new ValidationError(
      'Filename contains potentially dangerous characters',
      'filename',
      'SECURITY_VIOLATION'
    );
  }
}

/**
 * Enhanced database connection schema with security validation
 */
export const secureDbConnectionSchema = z.object({
  type: z.enum(["mysql", "postgres", "sqlite"]),
  host: z.string()
    .optional()
    .transform(val => val ? validateHostname(val) : val),
  port: z.number()
    .int()
    .optional()
    .transform(val => val ? validatePort(val) : val),
  user: z.string()
    .optional()
    .transform(val => val ? validateUsername(val) : val),
  password: z.string().optional(), // Password validation is minimal to avoid breaking legitimate passwords
  database: z.string()
    .min(1, "Database name is required")
    .transform(validateDatabaseName),
  filePath: z.string().optional(),
  fileData: z.any().optional(),
  fileId: z.string()
    .optional()
    .transform(val => val ? sanitizeString(val) : val),
});

/**
 * Enhanced verification request schema
 */
export const secureVerificationRequestSchema = z.object({
  source: secureDbConnectionSchema,
  target: secureDbConnectionSchema,
  sessionId: z.string()
    .optional()
    .transform(val => val ? sanitizeString(val) : val),
});

/**
 * Validate SQL query for potential injection attacks
 */
export function validateSqlQuery(query: string, allowedPatterns: string[] = []): string {
  const sanitized = sanitizeString(query);
  
  // Check for dangerous patterns
  for (const pattern of SECURITY_CONFIG.SQL_INJECTION_PATTERNS) {
    if (pattern.test(sanitized) && !allowedPatterns.some(allowed => sanitized.includes(allowed))) {
      throw new ValidationError(
        'Query contains potentially dangerous SQL patterns',
        'query',
        'SECURITY_VIOLATION'
      );
    }
  }
  
  return sanitized;
}

/**
 * Rate limiting data structure
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting function
 */
export function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const userRequests = requestCounts.get(identifier);
  
  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userRequests.count >= maxRequests) {
    return false;
  }
  
  userRequests.count++;
  return true;
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [identifier, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(identifier);
    }
  }
}

// Clean up rate limits every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

export { SECURITY_CONFIG };
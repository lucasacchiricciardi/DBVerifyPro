/**
 * Security Middleware for Enhanced Protection
 * Implements rate limiting, request validation, and security headers
 */

import { Request, Response, NextFunction } from 'express';
import { checkRateLimit, ValidationError } from '../utils/input-validation';
import { v4 as uuidv4 } from 'uuid';

/**
 * Security configuration
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self';",
};

const RATE_LIMITS = {
  verification: { maxRequests: 20, windowMs: 10 * 60 * 1000 }, // 20 requests per 10 minutes
  connection: { maxRequests: 50, windowMs: 5 * 60 * 1000 },    // 50 requests per 5 minutes
  upload: { maxRequests: 30, windowMs: 5 * 60 * 1000 },        // 30 uploads per 5 minutes
  default: { maxRequests: 200, windowMs: 15 * 60 * 1000 },     // 200 requests per 15 minutes
};

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Set security headers
  Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * Request ID middleware for tracing
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const reqId = uuidv4();
  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
}

/**
 * Rate limiting middleware factory
 */
export function rateLimit(type: keyof typeof RATE_LIMITS = 'default') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = getClientIdentifier(req);
    const limits = RATE_LIMITS[type];
    
    if (!checkRateLimit(clientId, limits.maxRequests, limits.windowMs)) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          details: {
            type,
            maxRequests: limits.maxRequests,
            windowMs: limits.windowMs,
          },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    next();
  };
}

/**
 * Input validation error handler
 */
export function validationErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        field: err.field,
        details: err.details,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }
  
  next(err);
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string;
  
  // Log request
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.path}`, {
    ip: getClientIdentifier(req),
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] [${requestId}] Response ${res.statusCode} - ${duration}ms`);
  });
  
  next();
}

/**
 * Body size limiter
 */
export function bodySizeLimit(maxSize: number = 100 * 1024 * 1024) { // 100MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    
    if (contentLength > maxSize) {
      res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request body too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
          details: { maxSize, receivedSize: contentLength },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    next();
  };
}

/**
 * CSRF protection for state-changing operations
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for GET requests
  if (req.method === 'GET') {
    next();
    return;
  }
  
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  const host = req.get('Host');
  
  // Check if request comes from same origin
  if (origin) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_VIOLATION',
          message: 'Cross-site request forgery detected',
          details: { origin: originHost, host },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
  } else if (referer) {
    const refererHost = new URL(referer).host;
    if (refererHost !== host) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_VIOLATION',
          message: 'Cross-site request forgery detected',
          details: { referer: refererHost, host },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
  } else {
    // No Origin or Referer header - might be legitimate API call or attack
    // Log for monitoring but allow for now
    console.warn(`[SECURITY] Request without Origin/Referer headers: ${req.method} ${req.path}`, {
      ip: getClientIdentifier(req),
      userAgent: req.get('User-Agent'),
    });
  }
  
  next();
}

/**
 * Content type validation
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip for GET requests
    if (req.method === 'GET') {
      next();
      return;
    }
    
    const contentType = req.get('Content-Type');
    if (!contentType) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONTENT_TYPE',
          message: 'Content-Type header is required',
          details: { allowedTypes },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );
    
    if (!isAllowed) {
      res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Unsupported Content-Type',
          details: { contentType, allowedTypes },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    next();
  };
}

/**
 * Initialize security middleware stack
 */
export function initializeSecurity() {
  return [
    securityHeaders,
    requestId,
    requestLogger,
    bodySizeLimit(),
    csrfProtection,
  ];
}
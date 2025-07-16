/**
 * Standardized API Response utilities
 * Ensures consistent response format across all endpoints
 */

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiResponseBuilder {
  /**
   * Create a standardized success response
   */
  static success<T>(data: T, requestId?: string): ApiSuccessResponse<T> {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Create a standardized error response
   */
  static error(
    message: string,
    code?: string,
    details?: Record<string, any>,
    requestId?: string
  ): ApiErrorResponse {
    return {
      success: false,
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Create error response from Error object
   */
  static fromError(error: Error, code?: string, requestId?: string): ApiErrorResponse {
    return {
      success: false,
      message: error.message,
      code: code || 'INTERNAL_ERROR',
      details: {
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Create validation error response
   */
  static validationError(
    field: string,
    message: string,
    requestId?: string
  ): ApiErrorResponse {
    return {
      success: false,
      message: `Validation failed for field '${field}': ${message}`,
      code: 'VALIDATION_ERROR',
      details: {
        field,
        validationMessage: message
      },
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Create database error response
   */
  static databaseError(
    operation: string,
    originalError: Error,
    requestId?: string
  ): ApiErrorResponse {
    return {
      success: false,
      message: `Database operation failed: ${operation}`,
      code: 'DATABASE_ERROR',
      details: {
        operation,
        originalError: originalError.message,
        stack: process.env.NODE_ENV === 'development' ? originalError.stack : undefined
      },
      timestamp: new Date().toISOString(),
      requestId
    };
  }
}

/**
 * Express middleware to add request ID to all requests
 */
export function addRequestId(req: any, res: any, next: any): void {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  next();
}

/**
 * Express error handler that returns standardized error responses
 */
export function standardErrorHandler(error: any, req: any, res: any, next: any): void {
  const requestId = req.requestId;
  
  if (res.headersSent) {
    return next(error);
  }

  let response: ApiErrorResponse;

  if (error.code && error.message) {
    // Custom application error
    response = ApiResponseBuilder.error(error.message, error.code, error.details, requestId);
  } else if (error.name === 'ValidationError') {
    // Zod validation error
    response = ApiResponseBuilder.validationError('request', error.message, requestId);
  } else {
    // Generic error
    response = ApiResponseBuilder.fromError(error, 'INTERNAL_ERROR', requestId);
  }

  const statusCode = error.status || error.statusCode || 500;
  res.status(statusCode).json(response);
}
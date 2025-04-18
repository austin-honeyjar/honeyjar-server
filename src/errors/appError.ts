export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: string;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    details?: string,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: string) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: string) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string, details?: string) {
    super(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

// Clerk-specific errors
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: string) {
    super(401, message, 'UNAUTHORIZED', details);
  }
}

export class InvalidSessionError extends UnauthorizedError {
  constructor(message: string = 'Invalid session', details?: string) {
    super(message, details);
  }
}

export class SessionExpiredError extends UnauthorizedError {
  constructor(message: string = 'Session expired', details?: string) {
    super(message, details);
  }
}

export class ClerkError extends AppError {
  constructor(message: string = 'Clerk authentication error', details?: string) {
    super(500, message, 'CLERK_ERROR', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: string) {
    super(403, message, 'FORBIDDEN', details);
  }
} 
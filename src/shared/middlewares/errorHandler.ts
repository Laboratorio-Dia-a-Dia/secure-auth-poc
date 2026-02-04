import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@shared/errors/AppError';
import { ZodError } from 'zod';
import { env } from '@config/env';

export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Zod Validation Errors
  if (error instanceof ZodError) {
    const errors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors,
    });
  }

  // Application Errors (Expected)
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
    });
  }

  // Unexpected Errors
  console.error('🔥 Unexpected Error:', error);

  return res.status(500).json({
    status: 'error',
    message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

// src/middleware/errorHandler.ts — Global error handling middleware (register LAST)

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../errors/AppError';
import { ValidationError } from '../errors/ValidationError';
import { NotFoundError } from '../errors/NotFoundError';
import { ConflictError } from '../errors/ConflictError';
import { env } from '../config/env';

/**
 * Catches all errors in the request pipeline and sends standardized JSON responses.
 * Must have 4 parameters for Express to recognize it as an error handler.
 * @param err - The thrown or forwarded error
 * @param req - Express Request (used for logging context)
 * @param res - Express Response
 * @param _next - Required by Express signature, unused
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── Operational AppErrors (intentionally thrown) ──────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && { details: err.details }),
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // ── Multer file upload errors ────────────────────────────────────────────
  if (err instanceof multer.MulterError) {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${env.maxFileSize / (1024 * 1024)}MB`,
      LIMIT_FILE_COUNT: 'Too many files. Maximum is 5 files per upload',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field. Use "images" for product images or "avatar" for avatars`,
    };

    const message = multerMessages[err.code] || `File upload error: ${err.message}`;

    res.status(400).json({
      success: false,
      error: {
        code: 'FILE_UPLOAD_ERROR',
        message,
        ...(env.isDevelopment && { multerCode: err.code, field: err.field }),
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // ── Prisma known errors ──────────────────────────────────────────────────
  const prismaError = err as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (prismaError.code === 'P2002') {
    // Unique constraint violation
    const fields = (prismaError.meta?.target as string[]) ?? ['unknown'];
    const fieldList = fields.join(', ');

    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `A record with this ${fieldList} already exists`,
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  if (prismaError.code === 'P2025') {
    // Record not found
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: prismaError.meta?.cause ?? 'Record not found',
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // ── Unknown / unexpected errors ──────────────────────────────────────────
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isDevelopment
        ? err.message
        : 'An unexpected error occurred',
      ...(env.isDevelopment && { stack: err.stack }),
    },
  });
}

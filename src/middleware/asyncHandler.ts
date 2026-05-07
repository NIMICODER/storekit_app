// src/middleware/asyncHandler.ts — Catches rejected promises in async route handlers

import { Request, Response, NextFunction } from 'express';

/** Async Express route handler signature. */
type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Wraps an async route handler so rejected promises forward to the error handler.
 * @param fn - Async route handler function
 * @returns Wrapped middleware that catches errors via .catch(next)
 */
export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

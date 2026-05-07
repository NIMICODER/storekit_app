// ── Standardized API Response Helpers ─────────────────────────────────────────

import { Response } from 'express';

// ── Response Shape Types ─────────────────────────────────────────────────────

/** Successful single-resource response envelope. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** Paginated list response envelope. */
export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

/** Offset-based pagination metadata. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Error response envelope. */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ── Response Helper Functions ────────────────────────────────────────────────

/** Send a 200 OK response with data. */
export function sendSuccess<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };

  res.status(200).json(body);
}

/** Send a 201 Created response with the newly created resource. */
export function sendCreated<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };

  res.status(201).json(body);
}

/** Send a 204 No Content response (e.g., after a DELETE). */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}

/**
 * Send a 200 OK paginated list response.
 * @param res - Express Response object
 * @param data - Array of items for the current page
 * @param meta - Offset-based pagination metadata
 */
export function sendPaginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  const body: ApiPaginatedResponse<T> = {
    success: true,
    data,
    meta,
  };

  res.status(200).json(body);
}

/**
 * Send an error response.
 * @param res - Express Response object
 * @param statusCode - HTTP status code
 * @param code - Machine-readable error code
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 */
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };

  res.status(statusCode).json(body);
}

// ── Pagination Helpers ───────────────────────────────────────────────────────

/** Build offset-based pagination metadata from total count, page, and limit. */
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// ── Cursor-Based Pagination ──────────────────────────────────────────────────

/** Cursor-based pagination metadata (no total count — optimized for large datasets). */
export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Build cursor pagination metadata from a result set.
 * @param items - Items returned from the DB query
 * @param limit - Requested page size
 * @returns Metadata with nextCursor and hasMore flag
 */
export function buildCursorPaginationMeta(
  items: Array<{ id: string }>,
  limit: number,
): CursorPaginationMeta {
  const hasMore = items.length >= limit;
  const lastItem = items[items.length - 1];

  return {
    limit,
    nextCursor: hasMore && lastItem ? lastItem.id : null,
    hasMore,
  };
}

/**
 * Send a 200 OK cursor-paginated list response.
 * @param res - Express Response object
 * @param data - Array of items for the current page
 * @param meta - Cursor pagination metadata
 */
export function sendCursorPaginated<T>(
  res: Response,
  data: T[],
  meta: CursorPaginationMeta,
): void {
  res.status(200).json({
    success: true,
    data,
    meta,
  });
}

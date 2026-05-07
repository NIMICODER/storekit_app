/**
 * src/utils/apiResponse.ts — Standardized API Response Helpers
 *
 * PURPOSE:
 *   Every API endpoint in this project returns JSON in one of three shapes:
 *     1. Success        → { success: true, data: T, message?: string }
 *     2. Paginated list → { success: true, data: T[], meta: PaginationMeta }
 *     3. Error          → { success: false, error: { code, message, details? } }
 *
 *   This file provides typed helper functions so every controller sends
 *   responses in the EXACT same format. Consistency matters:
 *     - Frontend developers can reliably parse `response.data`
 *     - Error handling is predictable (`response.error.code`)
 *     - API documentation is accurate
 *
 * WHY STANDARDIZE RESPONSES?
 *   Without this, different developers/controllers might return:
 *     { user: {...} }          ← different key name
 *     { result: {...} }        ← another key name
 *     { success: true, user }  ← inconsistent shape
 *
 *   With this utility, every endpoint returns the same envelope:
 *     { success: true, data: {...} }
 *
 * C# EQUIVALENT:
 *   Similar to wrapping controller responses in ActionResult<ApiResponse<T>>
 *   or using a custom middleware to wrap all responses in a standard envelope.
 *
 * USAGE EXAMPLE (in a controller):
 *   import { sendSuccess, sendCreated, sendPaginated } from '../utils/apiResponse';
 *
 *   // GET /products/:id
 *   sendSuccess(res, product);
 *
 *   // POST /products
 *   sendCreated(res, newProduct, 'Product created successfully');
 *
 *   // GET /products (list)
 *   sendPaginated(res, products, { total: 100, page: 1, limit: 20 });
 */

import { Response } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Response Shape Types
// ─────────────────────────────────────────────────────────────────────────────
//
// TypeScript generics (<T>) let us type the `data` property precisely.
// When a controller calls sendSuccess(res, product), TypeScript knows
// that `data` is of type `Product` in the response type.
//
// This is similar to C# generics: ApiResponse<Product>, ApiResponse<List<Order>>

/**
 * Shape of a successful single-resource response.
 *
 * Example JSON:
 * {
 *   "success": true,
 *   "data": { "id": 1, "name": "Wireless Headphones", "price": 49.99 },
 *   "message": "Product fetched successfully"   ← optional
 * }
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Shape of a paginated list response.
 *
 * Example JSON:
 * {
 *   "success": true,
 *   "data": [...],
 *   "meta": {
 *     "total": 100,
 *     "page": 2,
 *     "limit": 20,
 *     "totalPages": 5,
 *     "hasNextPage": true,
 *     "hasPrevPage": true
 *   }
 * }
 */
export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

/**
 * Pagination metadata included with list responses.
 * Clients need this to render pagination controls and fetch next pages.
 */
export interface PaginationMeta {
  /** Total number of records matching the query (across ALL pages) */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Number of records per page */
  limit: number;
  /** Total number of pages: Math.ceil(total / limit) */
  totalPages: number;
  /** Whether there is a page after the current one */
  hasNextPage: boolean;
  /** Whether there is a page before the current one */
  hasPrevPage: boolean;
}

/**
 * Shape of an error response.
 * Phase 5 will expand this with a global error handler and custom error classes.
 *
 * Example JSON:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "Product with id 999 not found",
 *     "details": null
 *   }
 * }
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    /** Machine-readable error code (used by frontend for specific handling) */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Optional additional details (e.g., validation errors per field) */
    details?: unknown;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a 200 OK success response with data.
 *
 * Use for: GET requests that find a resource, successful operations
 *
 * @param res     - Express Response object
 * @param data    - The payload to return (can be any type)
 * @param message - Optional human-readable success message
 *
 * HTTP 200 OK: The request succeeded. The response contains the result.
 */
export function sendSuccess<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    // Only include `message` in the response if it was provided.
    // Spreading `undefined` properties would include them as `undefined` in JSON.
    ...(message && { message }),
  };

  // res.status(200).json(body) does two things:
  //   1. Sets the HTTP status code to 200
  //   2. Serializes `body` to JSON, sets Content-Type: application/json, sends it
  res.status(200).json(body);
}

/**
 * Send a 201 Created response after successfully creating a resource.
 *
 * Use for: POST requests that create a new record
 *
 * HTTP 201 Created:
 *   The request succeeded and a new resource was created.
 *   By convention, the response body contains the newly created resource.
 *
 *   The difference between 200 and 201:
 *   - 200: Something was retrieved or an action succeeded
 *   - 201: Something new was CREATED
 *   This matters for API clients that handle these differently.
 */
export function sendCreated<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };

  res.status(201).json(body);
}

/**
 * Send a 204 No Content response.
 *
 * Use for: DELETE requests, or any successful action with no data to return
 *
 * HTTP 204 No Content:
 *   The request succeeded but there's nothing to return.
 *   A response with 204 MUST NOT include a body — browsers/clients ignore it anyway.
 *
 *   Common mistake: sending a JSON body with a 204 status.
 *   The HTTP spec says 204 = empty body. We enforce that here.
 */
export function sendNoContent(res: Response): void {
  // res.status(204).end() — note: NO .json() here
  // .end() closes the response stream without sending a body
  res.status(204).end();
}

/**
 * Send a 200 OK paginated list response.
 *
 * Use for: GET requests that return a list of resources (products, users, etc.)
 *
 * @param res   - Express Response object
 * @param data  - Array of items for the current page
 * @param meta  - Pagination metadata (total, page, limit, etc.)
 *               The caller is responsible for computing this (Phase 7 adds a helper)
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
 *
 * NOTE: This is a simple helper for Phase 2. In Phase 5, we'll add:
 *   - Custom error classes (NotFoundError, ValidationError, etc.)
 *   - A global error handling middleware that catches ALL errors automatically
 *   - Much more sophisticated error handling
 *
 * For now, controllers can call this directly for simple error cases.
 *
 * @param res        - Express Response object
 * @param statusCode - HTTP status code (400, 401, 403, 404, 500, etc.)
 * @param code       - Machine-readable error code ('NOT_FOUND', 'UNAUTHORIZED', etc.)
 * @param message    - Human-readable error message
 * @param details    - Optional additional error details
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

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a PaginationMeta object from total count + current page/limit.
 *
 * Usage:
 *   const meta = buildPaginationMeta(totalProducts, page, limit);
 *   sendPaginated(res, products, meta);
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Cursor-Based Pagination (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata shape for cursor-based pagination.
 *
 * Unlike offset pagination (which knows the total count and page numbers),
 * cursor pagination only knows:
 *   - How many items were requested (limit)
 *   - Whether there are more items (hasMore)
 *   - The cursor to fetch the next page (nextCursor)
 *
 * WHY NO TOTAL COUNT?
 * ──────────────────────────────────────────────────────────────────────────
 *   Cursor pagination is designed for large, changing datasets where:
 *     1. Counting all records is expensive (SELECT COUNT(*) on millions of rows)
 *     2. The total changes between page requests (new products added)
 *
 *   If you need a total count, use offset pagination instead.
 *   Each pagination style has trade-offs — see queryBuilder.ts for details.
 *
 * C# equivalent:
 *   public class CursorPage<T> {
 *     public List<T> Items { get; set; }
 *     public string? NextCursor { get; set; }
 *     public bool HasMore { get; set; }
 *     public int Limit { get; set; }
 *   }
 */
export interface CursorPaginationMeta {
  /** Number of items per page (requested limit) */
  limit: number;
  /** ID of the last item in the current page — pass this as ?cursor= for the next page */
  nextCursor: string | null;
  /** Whether there are more items after the current page */
  hasMore: boolean;
}

/**
 * Build cursor pagination metadata from a list of results.
 *
 * @param items - The items returned from the database query
 * @param limit - The requested page size (limit)
 * @returns CursorPaginationMeta with nextCursor and hasMore
 *
 * HOW hasMore WORKS:
 * ──────────────────────────────────────────────────────────────────────────
 *   We request `limit` items from the DB. If we got back exactly `limit`
 *   items, there MIGHT be more. If we got fewer, we've reached the end.
 *
 *   This is a common trick — instead of running a separate COUNT query,
 *   we just check if the result set is "full". It's not 100% precise
 *   (the last page might have exactly `limit` items), but it avoids
 *   an expensive count query. The worst case is one extra empty page fetch.
 *
 * @example
 *   // 10 items returned with limit=10 → there might be more
 *   buildCursorPaginationMeta(tenItems, 10)
 *   // → { limit: 10, nextCursor: 'last-item-id', hasMore: true }
 *
 *   // 7 items returned with limit=10 → this is the last page
 *   buildCursorPaginationMeta(sevenItems, 10)
 *   // → { limit: 10, nextCursor: null, hasMore: false }
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
 *
 * Similar to sendPaginated(), but uses CursorPaginationMeta instead of
 * offset-based PaginationMeta. The response shape is the same — only
 * the meta fields differ.
 *
 * @param res   - Express Response object
 * @param data  - Array of items for the current page
 * @param meta  - Cursor pagination metadata (limit, nextCursor, hasMore)
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

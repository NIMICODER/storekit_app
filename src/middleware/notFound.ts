/**
 * src/middleware/notFound.ts — 404 Not Found Handler
 *
 * PURPOSE:
 *   When a client requests a URL that doesn't match any defined route,
 *   Express falls through to the end of the middleware chain with no
 *   response sent. Without this handler, Express would hang (no response).
 *
 *   This middleware MUST be registered LAST (after all routes) so it only
 *   catches requests that nothing else handled.
 *
 * SIGNATURE DIFFERENCE — 2 parameters, not 3:
 *   Regular middleware:    (req, res, next) => void   ← 3 params
 *   Route handlers:       (req, res) => void          ← 2 params (no next needed)
 *   Error handlers:       (err, req, res, next) => void ← 4 params (Phase 5)
 *
 *   This is a ROUTE HANDLER (final handler), not middleware — it doesn't
 *   call next() because it always sends a response. Express's router calls
 *   it when no route matched.
 *
 * WHY NOT USE app.use('*', notFound)?
 *   app.use(notFound) without a path matches ALL unmatched requests.
 *   app.use('*', notFound) is similar but can interfere with route
 *   parameter matching. The pathless form is cleaner.
 *
 * PLACEMENT IN app.ts (IMPORTANT):
 *   ✓ Correct: After all routes
 *     app.use('/api/v1', routes);
 *     app.use(notFound);          ← LAST
 *
 *   ✗ Wrong: Before routes (would catch EVERY request)
 *     app.use(notFound);          ← Catches everything — routes never run!
 *     app.use('/api/v1', routes);
 *
 * C# EQUIVALENT:
 *   Similar to app.UseStatusCodePages() or a custom middleware at the end
 *   of the pipeline that returns 404 for unmatched routes.
 *   In minimal API: app.MapFallback(() => Results.NotFound())
 */

import { Request, Response } from 'express';
import { sendError } from '../utils/apiResponse';

/**
 * Handles all requests that didn't match any defined route.
 *
 * Sends a consistent JSON 404 response with:
 *   - The HTTP method that was attempted
 *   - The path that wasn't found
 *   - A machine-readable error code
 *
 * Example response:
 * HTTP 404
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ROUTE_NOT_FOUND",
 *     "message": "Cannot GET /api/v1/nonexistent"
 *   }
 * }
 */
export function notFound(req: Request, res: Response): void {
  sendError(
    res,
    404,
    'ROUTE_NOT_FOUND',
    // req.method: 'GET', 'POST', 'DELETE', etc.
    // req.originalUrl: the full URL path as the client sent it, including query string
    //   e.g., '/api/v1/nonexistent?foo=bar'
    // Note: req.path only has the path (no query string)
    //       req.originalUrl has path + query string (more informative for 404s)
    `Cannot ${req.method} ${req.originalUrl}`,
  );
}

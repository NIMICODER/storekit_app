/**
 * src/middleware/requestLogger.ts — HTTP Request Logger
 *
 * PURPOSE:
 *   Log every incoming HTTP request with:
 *     - A unique request ID
 *     - The HTTP method (GET, POST, etc.)
 *     - The URL path
 *     - The response status code
 *     - How long the request took (in milliseconds)
 *
 *   Sample output:
 *     → GET  /api/v1/health          [req: 550e8400]
 *     ← GET  /api/v1/health  200  3ms [req: 550e8400]
 *     → POST /api/v1/products        [req: a3f2c891]
 *     ← POST /api/v1/products 201 47ms [req: a3f2c891]
 *
 * WHY LOG REQUESTS?
 *   In production, request logs are your primary debugging tool. When
 *   something goes wrong, the logs tell you:
 *     - What the client called (method + path)
 *     - Whether it succeeded (status code)
 *     - How fast it responded (duration — helps find slow endpoints)
 *     - Which specific request caused the issue (request ID)
 *
 * WHY console.log NOW?
 *   Phase 14 replaces these with Pino, a structured JSON logger:
 *     { "level": "info", "method": "GET", "path": "/health", "status": 200 }
 *   Structured logs can be parsed by tools like Datadog, Grafana, or Kibana.
 *   For now, console.log is readable and gets the job done locally.
 *
 * C# EQUIVALENT:
 *   Similar to app.UseHttpLogging() in ASP.NET Core, or a custom
 *   IMiddleware implementation that logs request/response details.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// ANSI color codes for terminal output
// ─────────────────────────────────────────────────────────────────────────────
// These make the logs easier to read in the terminal.
// They'll be stripped when we switch to structured JSON logging in Phase 14.
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';

/**
 * Returns a colored status code string for terminal output.
 * Green for success, yellow for client errors, red for server errors.
 */
function colorizeStatus(statusCode: number): string {
  if (statusCode >= 500) return `${RED}${statusCode}${RESET}`;
  if (statusCode >= 400) return `${YELLOW}${statusCode}${RESET}`;
  if (statusCode >= 300) return `${CYAN}${statusCode}${RESET}`;
  return `${GREEN}${statusCode}${RESET}`;
}

/**
 * Returns a colored HTTP method string.
 */
function colorizeMethod(method: string): string {
  const colors: Record<string, string> = {
    GET: GREEN,
    POST: BLUE,
    PUT: YELLOW,
    PATCH: YELLOW,
    DELETE: RED,
  };
  const color = colors[method] ?? RESET;
  // padEnd(6) pads the method to 6 chars so the URL column lines up nicely
  //   "GET   /..." vs "DELETE /..." → aligned
  return `${color}${method.padEnd(6)}${RESET}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Middleware Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestLogger — Express middleware that logs every HTTP request.
 *
 * MIDDLEWARE SIGNATURE:
 *   Every Express middleware has this exact signature:
 *     (req: Request, res: Response, next: NextFunction) => void
 *
 *   - req: The incoming request object (method, URL, headers, body, params, query)
 *   - res: The outgoing response object (status code, headers, body)
 *   - next: A function to call when this middleware is done.
 *           next() → pass to the next middleware
 *           next(error) → skip to the error handler
 *
 * HOW THIS MIDDLEWARE WORKS:
 *   The challenge: when this middleware runs, the response hasn't been
 *   sent yet (the route handler hasn't run). So we can't log the status
 *   code or duration immediately.
 *
 *   Solution: listen to the response's 'finish' event.
 *   Node.js streams emit a 'finish' event when all data has been flushed.
 *   Express's Response object is a stream, so it emits 'finish' when
 *   the response is completely sent to the client.
 *
 *   This is like subscribing to an event that fires AFTER the response is sent.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate a unique ID for this request.
  // crypto.randomUUID() generates a UUID v4: "550e8400-e29b-41d4-a716-446655440000"
  // We take just the first 8 characters for readability in logs.
  req.requestId = randomUUID().split('-')[0]; // e.g., "550e8400"

  // Record when the request arrived.
  // Date.now() returns milliseconds since January 1, 1970 (Unix epoch).
  req.startTime = Date.now();

  // Log the incoming request (before it's processed)
  // eslint-disable-next-line no-console
  console.log(
    `${DIM}${new Date().toISOString()}${RESET} ` +
      `→ ${colorizeMethod(req.method)}` +
      `${req.originalUrl} ` +
      `${DIM}[req:${req.requestId}]${RESET}`,
  );

  // res.on('finish', callback) — subscribe to the response completion event.
  //
  // WHY 'finish' AND NOT JUST LOG AFTER next()?
  //   next() doesn't block. After calling next(), execution returns here
  //   immediately while the rest of the middleware chain runs asynchronously.
  //   By the time we'd try to read res.statusCode after next(), the response
  //   hasn't been sent yet.
  //
  //   The 'finish' event fires after res.send()/res.json()/res.end() completes,
  //   which is exactly when we have all the information we need.
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime ?? Date.now());

    // eslint-disable-next-line no-console
    console.log(
      `${DIM}${new Date().toISOString()}${RESET} ` +
        `← ${colorizeMethod(req.method)}` +
        `${req.originalUrl} ` +
        `${colorizeStatus(res.statusCode)} ` +
        `${DIM}${duration}ms [req:${req.requestId}]${RESET}`,
    );
  });

  // CRITICAL: Always call next() to pass control to the next middleware.
  // If you forget next(), the request hangs forever — no response is sent.
  // This is one of the most common Express bugs for beginners.
  next();
}

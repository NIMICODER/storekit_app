/**
 * src/app.ts — Express Application Setup
 *
 * PURPOSE:
 *   Creates and configures the Express application instance.
 *   Registers all middleware and mounts all routes.
 *   Does NOT start the HTTP server — that's server.ts's job.
 *
 * MIDDLEWARE PIPELINE (in order of execution):
 * ─────────────────────────────────────────────────────────────────
 *  1. requestLogger    → log every incoming request + assign request ID
 *  2. helmet           → set security HTTP headers
 *  3. cors             → allow cross-origin requests
 *  4. express.json     → parse JSON request bodies → req.body
 *  5. express.urlencoded → parse form-encoded bodies
 *  6. API routes       → /api/v1/health, /api/v1/products, etc.
 *  7. Root route       → GET / (API info)
 *  8. notFound handler → catch all unmatched routes
 *  9. errorHandler     → catch ALL errors, send standardized JSON (MUST be LAST)
 *
 * WHY ORDER MATTERS:
 *   requestLogger must be FIRST so it captures ALL requests including 404s.
 *   Body parsers must be BEFORE route handlers so req.body is populated.
 *   notFound must be LAST so it only catches requests no route handled.
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';

const app: Application = express();

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — runs on EVERY request, in order
// ─────────────────────────────────────────────────────────────────────────────

// 1. Request logger — MUST be first to capture all requests
//    Assigns req.requestId and req.startTime, logs on response finish
app.use(requestLogger);

// 2. Security headers
//    Adds X-Frame-Options, X-Content-Type-Options, HSTS, etc.
app.use(helmet());

// 3. CORS — allow browser requests from other origins
app.use(
  cors({
    origin: env.isDevelopment ? '*' : (process.env.ALLOWED_ORIGINS?.split(',') ?? []),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// 4. JSON body parser — populates req.body for JSON payloads
//    Content-Type: application/json → req.body = { ... }
app.use(express.json({ limit: '10kb' }));

// 5. URL-encoded body parser — populates req.body for HTML form submissions
//    Content-Type: application/x-www-form-urlencoded → req.body = { ... }
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Bare health check at /health (no version prefix).
// Load balancers and Kubernetes probes call this — they don't know our API version.
// This is kept separate from the versioned API routes intentionally.
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route — API info and documentation link
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'StoreKit API',
    version: env.apiVersion,
    docs: `/api/${env.apiVersion}/docs`,
    health: `/api/${env.apiVersion}/health`,
  });
});

// Mount all versioned API routes at /api/v1
// The router in routes/index.ts aggregates all feature routers.
//
// HOW URL COMPOSITION WORKS:
//   app.use('/api/v1', apiRouter) + router.use('/health', healthRouter)
//   + healthRouter.get('/')
//   → Final URL: GET /api/v1/health
//
//   app.use('/api/v1', apiRouter) + router.use('/health', healthRouter)
//   + healthRouter.get('/ping')
//   → Final URL: GET /api/v1/health/ping
//
// This composability is the main benefit of Express Router modules.
app.use(`/api/${env.apiVersion}`, apiRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 404 HANDLER — must be registered AFTER all routes
// ─────────────────────────────────────────────────────────────────────────────
//
// If execution reaches here, no route above matched the request.
// The notFound middleware sends a JSON 404 response.
app.use(notFound);

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER — must be registered LAST (after notFound)
// ─────────────────────────────────────────────────────────────────────────────
//
// This catches ALL errors thrown anywhere in the pipeline:
//   - ValidationError from validate() middleware (400)
//   - NotFoundError from services (404)
//   - ConflictError from services (409)
//   - Prisma errors (P2002, P2025) mapped to 409/404
//   - Unexpected errors → 500
//
// Express identifies this as an error handler because it has 4 parameters
// (err, req, res, next). Regular middleware has 3 parameters.
//
// C# equivalent:
//   app.UseExceptionHandler() — must also be registered after routing middleware
//
// WHY AFTER notFound?
//   notFound sends a 404 response for unmatched routes — it doesn't throw.
//   errorHandler catches THROWN errors from matched routes.
//   They serve different purposes and don't interfere with each other.
app.use(errorHandler);

export default app;

// ── src/app.ts ── Express Application Setup ─────────────────────────
//
// This is the Express application factory. It wires up all middleware,
// routes, and error handlers in the correct order.
//
// MIDDLEWARE ORDER MATTERS:
//   1. Request logging (first — logs every request)
//   2. Security (Helmet, CORS)
//   3. Compression (gzip/brotli — must be before routes so responses are compressed)
//   4. Rate limiting (global — before routes to reject abusers early)
//   5. Body parsing (webhook raw → JSON → URL-encoded)
//   6. Static files (uploads)
//   7. Routes (API endpoints)
//   8. 404 handler (after all routes)
//   9. Error handler (last — catches everything)
//
// C# COMPARISON:
//   In ASP.NET, middleware order is controlled in Program.cs:
//     app.UseResponseCompression();
//     app.UseRateLimiter();
//     app.UseRouting();
//     app.UseSwagger();
//     app.UseEndpoints(...);
//   Same concept — the pipeline order determines behavior.

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { requestLogger } from './middleware/requestLogger';
import { compressionMiddleware } from './middleware/compression';
import { globalLimiter } from './middleware/rateLimiter';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';

const app: Application = express();

// ── Middleware ───────────────────────────────────────────────────────

app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin: env.isDevelopment ? '*' : (process.env.ALLOWED_ORIGINS?.split(',') ?? []),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Response Compression (Phase 12) ─────────────────────────────────
// gzip/brotli compression for all responses over 1KB.
// Must be BEFORE routes so Express compresses the response body.
//
// C# equivalent: app.UseResponseCompression();
app.use(compressionMiddleware);

// ── Global Rate Limiter (Phase 12) ──────────────────────────────────
// 100 requests per 15-minute window per IP (configurable via env vars).
// Applied to ALL routes. Individual routes can add stricter limiters
// (auth routes: 10/15min, checkout: 20/15min) that stack on top.
//
// C# equivalent: app.UseRateLimiter();
app.use(globalLimiter);

// ── Webhook Raw Body Parsing (Phase 11) ──────────────────────────
// Webhook routes need the RAW request body (not parsed JSON) for HMAC
// signature verification. express.raw() preserves the exact bytes.
//
// IMPORTANT: This must come BEFORE express.json(), because Express
// stops parsing once the first body parser matches. The path filter
// ensures only webhook routes get raw bodies; everything else gets JSON.
//
// In C#/ASP.NET, you'd use [DisableRequestSizeLimit] and manually
// read Request.Body as a stream. Express gives us a more declarative
// approach with path-based body parser selection.
app.use(
  `/api/${env.apiVersion}/webhooks`,
  express.raw({ type: 'application/json', limit: '10kb' }),
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Static Files ────────────────────────────────────────────────────
// Serve uploads before API routes for fast, unauthenticated access

app.use('/uploads', express.static(path.join(process.cwd(), env.uploadDir)));

// ── Swagger UI (Phase 12) ───────────────────────────────────────────
// Serves interactive API documentation at /api/v1/docs.
// The spec is generated from @openapi JSDoc annotations in route files.
//
// C# equivalent:
//   app.UseSwagger();
//   app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "API v1"));
//
// The JSON spec is also available at /api/v1/docs/swagger.json for
// code generators and other tools.
app.use(
  `/api/${env.apiVersion}/docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'StoreKit API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }),
);

// Expose the raw OpenAPI JSON spec (useful for code generators, Postman import)
app.get(`/api/${env.apiVersion}/docs/swagger.json`, (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Routes ──────────────────────────────────────────────────────────

// Bare health check (no version prefix) for load balancers / k8s probes
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'StoreKit API',
    version: env.apiVersion,
    docs: `/api/${env.apiVersion}/docs`,
    health: `/api/${env.apiVersion}/health`,
  });
});

// Versioned API routes
app.use(`/api/${env.apiVersion}`, apiRouter);

// ── 404 & Error Handling ────────────────────────────────────────────
// notFound must be after all routes; errorHandler must be last

app.use(notFound);
app.use(errorHandler);

export default app;

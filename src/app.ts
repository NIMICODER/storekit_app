// ── src/app.ts ── Express Application Setup ─────────────────────────

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
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

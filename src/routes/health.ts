/**
 * src/routes/health.ts — Health Check Router
 *
 * PURPOSE:
 *   Defines routes for checking the health/status of the API.
 *   Used by load balancers, container orchestrators (Kubernetes),
 *   and monitoring systems to verify the service is alive.
 *
 * ROUTES:
 *   GET /api/v1/health        → Full health check with details
 *   GET /api/v1/health/ping   → Minimal liveness probe (just "pong")
 *
 * WHAT IS A ROUTER?
 * ─────────────────────────────────────────────────────────────────
 * An Express Router is a "mini application" — it has its own middleware
 * stack and routes, but no server. You create a Router, define routes on it,
 * then MOUNT it on the main app at a path prefix.
 *
 * Think of it like a controller in ASP.NET Core's [Route] attribute:
 *   [Route("api/v1/health")]        ← the prefix
 *   public class HealthController   ← the router/controller
 *
 * app.use('/api/v1/health', healthRouter) = [Route("api/v1/health")]
 * router.get('/', handler)          = [HttpGet]          → GET /api/v1/health
 * router.get('/ping', handler)      = [HttpGet("ping")]   → GET /api/v1/health/ping
 *
 * DIFFERENCE: app.get() vs router.get()
 * ─────────────────────────────────────────────────────────────────
 *   app.get('/path', handler)
 *     → Registers a route on the TOP-LEVEL Express application
 *     → The full path is '/path'
 *
 *   router.get('/path', handler)
 *     → Registers a route on THIS ROUTER
 *     → The full path depends on where the router is mounted:
 *       If mounted at '/api/v1/health', then '/path' becomes '/api/v1/health/path'
 *       If mounted at '/admin',         then '/path' becomes '/admin/path'
 *
 *   Routers let you define routes RELATIVE to their mount point.
 *   This makes routers reusable and easy to move around.
 */

import { Router, Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import prisma from '../config/database';

// Router() creates a new Express router instance.
// This is just a route container — it doesn't start a server.
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/health
 *
 * Full health check — returns environment, uptime, and memory usage.
 *
 * Used by:
 *   - Developers debugging deployment issues
 *   - Monitoring dashboards (Grafana, Datadog)
 *   - Phase 14 will add database + Redis connectivity checks
 *
 * IMPORTANT NOTES ABOUT req, res, req.params, req.query, req.body:
 * ────────────────────────────────────────────────────────────────
 *
 * req (Request) — the incoming HTTP request:
 *   req.method      → 'GET', 'POST', 'DELETE', etc.
 *   req.path        → '/health' (path relative to this router)
 *   req.originalUrl → '/api/v1/health' (full path from the root)
 *   req.headers     → { 'content-type': 'application/json', ... }
 *   req.ip          → client's IP address
 *
 * req.params — route parameters (values captured from the URL pattern):
 *   Route defined as: router.get('/:id', handler)
 *   URL requested:    /api/v1/health/123
 *   req.params.id →   '123'   (always a string — parse to number if needed)
 *
 * req.query — query string parameters (after the ? in the URL):
 *   URL requested:      /api/v1/products?page=2&limit=20&sort=price:asc
 *   req.query.page →    '2'
 *   req.query.limit →   '20'
 *   req.query.sort →    'price:asc'
 *   Note: all query values are strings (or arrays if repeated: ?tag=a&tag=b)
 *
 * req.body — the parsed request body (for POST/PUT/PATCH requests):
 *   Only available for requests with a body (POST, PUT, PATCH)
 *   For GET requests, req.body is always {}
 *   Requires express.json() or express.urlencoded() middleware to be set up
 *   Example: POST body { "name": "Headphones" } → req.body.name === 'Headphones'
 *
 * res (Response) — the outgoing HTTP response:
 *   res.status(200)   → set the status code
 *   res.json({ })     → send JSON body (sets Content-Type: application/json)
 *   res.send('text')  → send plain text
 *   res.set('X-Custom', 'value') → set a header
 */
router.get('/', async (_req: Request, res: Response) => {
  // process.memoryUsage() returns memory usage of the Node.js process:
  //   rss: Resident Set Size — total memory allocated for the process
  //   heapTotal: total size of the V8 JavaScript heap
  //   heapUsed: memory actually used by JavaScript objects
  //   external: memory used by C++ objects linked to JS objects
  const memoryUsage = process.memoryUsage();

  // ── Database Connectivity Check ──
  // We run a simple `SELECT 1` query to verify the database is reachable.
  // This is the standard "ping" pattern for relational databases.
  //
  // Wrapped in try/catch so the health endpoint NEVER crashes —
  // if the DB is down, we report it as "disconnected" but still return 200 OK.
  // (Some teams prefer to return 503 if DB is down — both approaches are valid.)
  //
  // .NET equivalent: DbContext.Database.CanConnect()
  let databaseStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = 'connected';
  } catch {
    // Database is unreachable — we log but don't crash
    databaseStatus = 'disconnected';
  }

  sendSuccess(res, {
    status: 'ok',
    environment: process.env.NODE_ENV ?? 'development',

    // process.uptime() → seconds the Node.js process has been running
    // We convert to a readable string (e.g., "2h 15m 30s")
    uptime: formatUptime(process.uptime()),

    // Memory in MB, rounded to 2 decimal places
    memory: {
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    },

    timestamp: new Date().toISOString(),

    // Service connectivity status
    services: {
      database: databaseStatus,
      redis: 'not_configured', // Phase 9
    },
  });
});

/**
 * GET /api/v1/health/ping
 *
 * Minimal liveness probe — just confirms the HTTP server is responding.
 *
 * Liveness probes are used by Kubernetes/Docker to know:
 *   "Is this container alive and able to serve traffic?"
 *
 * They need to be:
 *   - Fast (no database calls)
 *   - Simple (binary: alive or not)
 *   - Cheap (called every few seconds in production)
 *
 * HTTP 200 = alive, anything else = something's wrong.
 *
 * DEMONSTRATING req.query (even though we don't need it here):
 *   Try: GET /api/v1/health/ping?echo=hello
 *   The response will include { "echo": "hello" }
 *   This shows how query params work — try it with curl!
 */
router.get('/ping', (req: Request, res: Response) => {
  // req.query is an object of all query string parameters.
  // Type: ParsedQs — a nested object of string | string[] | ParsedQs values.
  // We read req.query.echo as a string (with a type assertion).
  const echo = typeof req.query.echo === 'string' ? req.query.echo : undefined;

  sendSuccess(res, {
    message: 'pong',
    // Only include the echo if it was provided in the query string
    ...(echo && { echo }),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts seconds (from process.uptime()) to a human-readable string.
 * e.g., 3665 → "1h 1m 5s"
 */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

// Export the router for mounting in routes/index.ts
export default router;

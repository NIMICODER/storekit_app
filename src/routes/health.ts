// src/routes/health.ts — Health Check Router

import { Router, Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import prisma from '../config/database';
import redisClient from '../config/redis';
import { isBullMQConnected } from '../config/bullmq';
import { getQueueStats } from '../queues/setup';

const router = Router();

// ── Route Handlers ───────────────────────────────────────────────────────────

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Full health check
 *     description: |
 *       Returns environment, uptime, memory usage, and connectivity status
 *       for all services (database, Redis, BullMQ). Also reports queue
 *       statistics (waiting, active, completed, failed job counts).
 *     responses:
 *       200:
 *         description: Health check results with service statuses
 */
/** GET /api/v1/health — full health check with environment, uptime, memory, and service status. */
router.get('/', async (_req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();

  // Verify database connectivity with a simple query
  let databaseStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = 'connected';
  } catch {
    databaseStatus = 'disconnected';
  }

  // Verify Redis connectivity with a PING command.
  // PING is the standard Redis health check — it returns "PONG" if alive.
  // In C#, this is like calling IConnectionMultiplexer.GetDatabase().Ping().
  let redisStatus = 'disconnected';
  try {
    if (redisClient?.isOpen) {
      const pong = await redisClient.ping();
      redisStatus = pong === 'PONG' ? 'connected' : 'disconnected';
    }
  } catch {
    redisStatus = 'disconnected';
  }

  // Check BullMQ (IORedis) connectivity.
  // This is a separate connection from the cache Redis client above.
  const bullmqStatus = isBullMQConnected() ? 'connected' : 'disconnected';

  // Get queue job counts (waiting, active, completed, failed).
  // In C#, this is like querying Hangfire's IMonitoringApi.GetStatistics().
  let queueStats: Record<string, Record<string, number>> = {};
  try {
    queueStats = await getQueueStats();
  } catch {
    // Non-fatal — health endpoint still returns other info.
  }

  sendSuccess(res, {
    status: 'ok',
    environment: process.env.NODE_ENV ?? 'development',
    uptime: formatUptime(process.uptime()),
    memory: {
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    },
    timestamp: new Date().toISOString(),
    services: {
      database: databaseStatus,
      redis: redisStatus,
      bullmq: bullmqStatus,
    },
    queues: queueStats,
  });
});

/**
 * @openapi
 * /health/ping:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe (minimal)
 *     description: Lightweight ping endpoint for load balancers and Kubernetes probes. No database calls.
 *     parameters:
 *       - in: query
 *         name: echo
 *         schema:
 *           type: string
 *         description: Optional string echoed back in the response
 *     responses:
 *       200:
 *         description: Pong response with timestamp
 */
/** GET /api/v1/health/ping — minimal liveness probe, no DB calls. */
router.get('/ping', (req: Request, res: Response) => {
  const echo = typeof req.query.echo === 'string' ? req.query.echo : undefined;

  sendSuccess(res, {
    message: 'pong',
    ...(echo && { echo }),
    timestamp: new Date().toISOString(),
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converts seconds to human-readable uptime string (e.g. "1h 1m 5s"). */
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

export default router;

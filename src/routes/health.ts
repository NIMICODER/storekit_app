// src/routes/health.ts — Health Check Router

import { Router, Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import prisma from '../config/database';
import redisClient from '../config/redis';

const router = Router();

// ── Route Handlers ───────────────────────────────────────────────────────────

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
    },
  });
});

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

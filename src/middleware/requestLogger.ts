// src/middleware/requestLogger.ts — HTTP request/response logger

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';

/** Colorize status code: green=2xx, cyan=3xx, yellow=4xx, red=5xx */
function colorizeStatus(statusCode: number): string {
  if (statusCode >= 500) return `${RED}${statusCode}${RESET}`;
  if (statusCode >= 400) return `${YELLOW}${statusCode}${RESET}`;
  if (statusCode >= 300) return `${CYAN}${statusCode}${RESET}`;
  return `${GREEN}${statusCode}${RESET}`;
}

/** Colorize HTTP method with fixed-width padding for aligned output */
function colorizeMethod(method: string): string {
  const colors: Record<string, string> = {
    GET: GREEN,
    POST: BLUE,
    PUT: YELLOW,
    PATCH: YELLOW,
    DELETE: RED,
  };
  const color = colors[method] ?? RESET;
  return `${color}${method.padEnd(6)}${RESET}`;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/** Logs incoming requests and outgoing responses with timing and request ID. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID().split('-')[0];
  req.startTime = Date.now();

  // eslint-disable-next-line no-console
  console.log(
    `${DIM}${new Date().toISOString()}${RESET} ` +
      `→ ${colorizeMethod(req.method)}` +
      `${req.originalUrl} ` +
      `${DIM}[req:${req.requestId}]${RESET}`,
  );

  // Log response after it's fully sent
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

  next();
}

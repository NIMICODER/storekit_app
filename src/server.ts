// ── src/server.ts ── HTTP Server Entry Point ────────────────────────

import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';

// ── Startup ─────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  // Connect to PostgreSQL (required — throws if unreachable)
  await connectDatabase();

  // Connect to Redis (optional — logs warning if unreachable, app still works)
  await connectRedis();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`
  ╔══════════════════════════════════════════╗
  ║         StoreKit API is running          ║
  ╠══════════════════════════════════════════╣
  ║  Environment : ${env.nodeEnv.padEnd(25)}║
  ║  Port        : ${String(env.port).padEnd(25)}║
  ║  API Version : ${env.apiVersion.padEnd(25)}║
  ║  Health      : http://localhost:${String(env.port).padEnd(9)}║
  ╚══════════════════════════════════════════╝
    `);
  });

  // ── Graceful Shutdown ───────────────────────────────────────────────

  /** Drains connections then exits. @param signal - SIGTERM or SIGINT */
  function gracefulShutdown(signal: string): void {
    // eslint-disable-next-line no-console
    console.log(`\n[Server] ${signal} received. Starting graceful shutdown...`);

    server.close(async (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('[Server] Error during shutdown:', err.message);
        process.exit(1);
      }

      await disconnectDatabase();
      await disconnectRedis();

      // eslint-disable-next-line no-console
      console.log('[Server] All connections closed. Exiting cleanly.');
      process.exit(0);
    });

    // Force exit if connections don't drain in time
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error(
        `[Server] Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms. Forcing exit.`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  // ── Signal Handlers ─────────────────────────────────────────────────

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // ── Server Error Handler ────────────────────────────────────────────

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        `\n[Server] ERROR: Port ${env.port} is already in use.\n` +
          `  → Stop the other process or change PORT in .env\n`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n[Server] Startup error: ${error.message}\n`);
    }
    process.exit(1);
  });
}

// ── Global Error Handlers ───────────────────────────────────────────

process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error('\n[Process] Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  // eslint-disable-next-line no-console
  console.error('\n[Process] Uncaught Exception:', error.message);
  // eslint-disable-next-line no-console
  console.error(error.stack);
  process.exit(1);
});

// ── Start ───────────────────────────────────────────────────────────

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

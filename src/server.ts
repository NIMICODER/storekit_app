/**
 * src/server.ts — HTTP Server Entry Point
 *
 * PURPOSE:
 *   The main entry point of the application. Starts the HTTP server
 *   and handles the process lifecycle: startup, shutdown, and fatal errors.
 *
 * PHASE 2 ADDITIONS vs PHASE 1:
 *   + Graceful shutdown on SIGTERM and SIGINT signals
 *
 * WHAT IS GRACEFUL SHUTDOWN?
 * ─────────────────────────────────────────────────────────────────
 * When you stop a server (Ctrl+C, Docker stop, Kubernetes pod termination),
 * the OS sends a signal to the process.
 *
 * WITHOUT graceful shutdown:
 *   1. Signal arrives
 *   2. Process killed immediately
 *   3. In-flight requests are dropped mid-response
 *   4. Database connections are torn down abruptly
 *   5. Users get connection reset errors
 *
 * WITH graceful shutdown:
 *   1. Signal arrives
 *   2. Server stops accepting NEW connections
 *   3. Existing connections are allowed to finish
 *   4. Once all connections drain, process exits cleanly
 *   5. Users finish their requests normally
 *
 * This is the Node.js equivalent of:
 *   IHostApplicationLifetime.StopApplication() in ASP.NET Core
 *   or WebApplication.StopAsync() in .NET 6+
 *
 * SIGNALS:
 *   SIGTERM → "Please stop" (sent by Docker, Kubernetes, PM2, systemd)
 *   SIGINT  → Ctrl+C in the terminal (sent by the shell)
 *   SIGKILL → "Stop NOW" (cannot be caught — hard kill)
 */

import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATION STARTUP
// ─────────────────────────────────────────────────────────────────────────────
//
// Startup sequence:
//   1. Connect to the database (fail-fast if unreachable)
//   2. Start the HTTP server (begin accepting requests)
//
// This is an async IIFE (Immediately Invoked Function Expression).
// We need async/await for the database connection, but top-level code
// in Node.js modules isn't async by default (unless using ESM + top-level await).
//
// .NET equivalent: This is like Program.cs calling app.Run() after
// builder.Services.AddDbContext<>() and builder.Build().
// ─────────────────────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  // Step 1: Connect to the database
  // If this fails, the error propagates and the process exits (see catch below).
  // This is "fail-fast" design — better to crash on startup with a clear error
  // than to start accepting requests and fail on every DB query.
  await connectDatabase();

  // Step 2: Start the HTTP server
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

  // ─────────────────────────────────────────────────────────────────────────
  // GRACEFUL SHUTDOWN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiates graceful shutdown of the HTTP server and database.
   *
   * Steps:
   *   1. Stop accepting new HTTP connections (server.close)
   *   2. Disconnect from the database (close connection pool)
   *   3. Exit the process with code 0 (success)
   *
   * A timeout forces exit after 10 seconds in case connections don't drain.
   *
   * @param signal - The signal name ('SIGTERM' or 'SIGINT') for logging
   */
  function gracefulShutdown(signal: string): void {
    // eslint-disable-next-line no-console
    console.log(`\n[Server] ${signal} received. Starting graceful shutdown...`);

    // server.close() stops the server from accepting NEW connections.
    // The callback fires when ALL existing connections have ended.
    server.close(async (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('[Server] Error during shutdown:', err.message);
        process.exit(1);
      }

      // Disconnect from the database — close all pool connections cleanly.
      // This prevents "connection reset" errors in PostgreSQL logs.
      await disconnectDatabase();

      // eslint-disable-next-line no-console
      console.log('[Server] All connections closed. Exiting cleanly.');
      process.exit(0);
    });

    // Safety timeout: if connections don't drain within 10 seconds, force exit.
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error(
        `[Server] Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms. Forcing exit.`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCESS SIGNAL HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // SIGTERM — sent by Docker, Kubernetes, PM2, systemd when stopping
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // SIGINT — sent when you press Ctrl+C in the terminal
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // ─────────────────────────────────────────────────────────────────────────
  // FATAL ERROR HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLERS (must be outside startServer to catch startup errors)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// START THE APPLICATION
// ─────────────────────────────────────────────────────────────────────────────

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

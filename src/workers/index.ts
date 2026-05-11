// ── src/workers/index.ts ── Worker Lifecycle Manager ─────────────────
//
// Central start/stop for all BullMQ workers. Called by server.ts
// during startup and graceful shutdown.
//
// WHY A CENTRAL MANAGER?
//   Workers need to start AFTER Redis connects and stop BEFORE Redis
//   disconnects. Having a single start/stop entry point ensures the
//   correct lifecycle order and makes adding new workers easy.
//
// In C#, this is like a CompositeHostedService that starts/stops
// multiple IHostedService instances in order:
//   services.AddHostedService<EmailWorkerService>();
//   services.AddHostedService<InventoryWorkerService>();
//   services.AddHostedService<OrderWorkerService>();

import { startEmailWorker, stopEmailWorker } from './email.worker';
import { startInventoryWorker, stopInventoryWorker } from './inventory.worker';
import { startOrderWorker, stopOrderWorker } from './order.worker';
import { registerAbandonedCartSchedule } from '../queues/email.queue';

/**
 * Start all background job workers.
 *
 * Call this AFTER Redis is connected (workers need a live connection).
 * Each worker connects to its queue and starts pulling jobs.
 *
 * Also registers scheduled/cron jobs (like the abandoned cart scanner).
 */
export async function startAllWorkers(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[Workers] Starting all workers...');

  // Start workers — order doesn't matter since they're independent.
  startEmailWorker();
  startInventoryWorker();
  startOrderWorker();

  // Register scheduled jobs (cron-based repeatable jobs).
  // These are idempotent — calling twice won't create duplicate schedules.
  await registerAbandonedCartSchedule();

  // eslint-disable-next-line no-console
  console.log('[Workers] All workers started');
}

/**
 * Gracefully stop all background job workers.
 *
 * Each worker's `.close()` drains its current job (waits for it to
 * finish), then disconnects from the queue. No jobs are lost.
 *
 * Call this BEFORE closing queues and disconnecting Redis.
 *
 * SHUTDOWN ORDER (managed by server.ts):
 *   1. server.close()           — stop accepting HTTP requests
 *   2. stopAllWorkers()         — drain running jobs (THIS)
 *   3. closeAllQueues()         — close queue producers
 *   4. closeBullMQConnection()  — close IORedis
 *   5. disconnectRedis()        — close cache Redis
 *   6. disconnectDatabase()     — close Prisma/PostgreSQL
 */
export async function stopAllWorkers(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[Workers] Stopping all workers (draining current jobs)...');

  // Stop all workers in parallel — they're independent.
  await Promise.all([
    stopEmailWorker(),
    stopInventoryWorker(),
    stopOrderWorker(),
  ]);

  // eslint-disable-next-line no-console
  console.log('[Workers] All workers stopped');
}

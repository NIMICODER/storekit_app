// ── src/queues/setup.ts ── Queue Registry & BullBoard Dashboard ─────
//
// Central place to create, configure, and export all BullMQ queues.
// Also sets up the Bull Board dashboard for monitoring jobs in development.
//
// ARCHITECTURE:
//   Queue = a named Redis list where jobs are stored.
//   Producer = code that adds jobs to a queue (this file + feature queues).
//   Worker = code that picks up jobs and processes them (src/workers/).
//
// In C#/MassTransit terms:
//   Queue ≈ IReceiveEndpoint
//   Producer ≈ ISendEndpoint / IPublishEndpoint
//   Worker ≈ IConsumer<TMessage>
//
// WHY SEPARATE QUEUES?
//   Different job types have different priorities, retry strategies, and
//   concurrency needs. Email can retry 5 times; inventory checks don't
//   need retries. Separate queues let you tune each independently.

import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import bullMQConnection from '../config/bullmq';
import { env } from '../config/env';
import { QUEUE_NAMES } from '../types/jobs';

// ── Queue Registry ──────────────────────────────────────────────────
// All queues are created here and exported. Workers import the queue
// names; producers import the queue instances to add jobs.

// Store all queues in a map for lifecycle management (close on shutdown).
const queues = new Map<string, Queue>();

/**
 * Create a BullMQ Queue connected to our shared IORedis instance.
 *
 * `defaultJobOptions` are applied to every job added to this queue
 * unless the producer overrides them. Think of these as sensible defaults.
 *
 * @param name - Queue name (from QUEUE_NAMES constant)
 * @returns The created Queue instance
 */
function createQueue(name: string): Queue {
  if (!bullMQConnection) {
    // eslint-disable-next-line no-console
    console.warn(`[Queues] Cannot create queue "${name}" — no Redis connection`);
    // Return a queue anyway — BullMQ will buffer jobs and fail gracefully.
    // This keeps the app running even without Redis.
  }

  const queue = new Queue(name, {
    // Share the IORedis connection across all queues.
    // In C#, this is like using the same IConnectionMultiplexer for all endpoints.
    connection: bullMQConnection!,

    // Default options applied to every job in this queue.
    // Individual jobs can override these when they're added.
    defaultJobOptions: {
      // ── Retry Strategy ──────────────────────────────────────────
      // If a job fails, retry up to N times with exponential backoff.
      // Attempt 1: immediate. Attempt 2: 1s. Attempt 3: 2s. Attempt 4: 4s.
      // In C#/Polly, this is: Policy.Handle<Exception>().WaitAndRetryAsync(...)
      attempts: env.bullMaxRetries + 1, // +1 because the first attempt counts
      backoff: {
        type: 'exponential',
        delay: env.bullRetryBackoff, // Base delay in ms (doubles each retry)
      },

      // ── Cleanup ─────────────────────────────────────────────────
      // Keep completed/failed jobs around for debugging, then auto-remove.
      // Without this, Redis fills up with old job records.
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,     // ...but never more than 1000
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days (for debugging)
        count: 5000,
      },
    },
  });

  queues.set(name, queue);
  return queue;
}

// ── Create All Queues ───────────────────────────────────────────────

export const emailQueue = createQueue(QUEUE_NAMES.EMAIL);
export const inventoryQueue = createQueue(QUEUE_NAMES.INVENTORY);
export const orderQueue = createQueue(QUEUE_NAMES.ORDER);

// ── BullBoard Dashboard ─────────────────────────────────────────────
//
// Bull Board is a web UI for monitoring BullMQ queues — see job counts,
// retry failed jobs, check payloads, etc. Think of it as the Hangfire
// Dashboard in C# (https://localhost/hangfire).
//
// We only mount it in development to avoid exposing internal state
// in production. In prod, you'd use a dedicated monitoring tool.

/**
 * Create the Bull Board Express adapter for mounting as middleware.
 *
 * Usage in routes/index.ts:
 *   app.use('/admin/queues', getBullBoardRouter());
 *
 * @returns Express middleware (Router) for the BullBoard UI
 */
export function getBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(`/api/${env.apiVersion}/admin/queues`);

  createBullBoard({
    queues: [
      new BullMQAdapter(emailQueue),
      new BullMQAdapter(inventoryQueue),
      new BullMQAdapter(orderQueue),
    ],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}

// ── Queue Job Counts (for Health Check) ─────────────────────────────

/**
 * Get job counts for all queues. Used by the health endpoint.
 *
 * Returns counts like:
 *   { email: { waiting: 5, active: 2, completed: 100, failed: 1 }, ... }
 */
export async function getQueueStats(): Promise<Record<string, Record<string, number>>> {
  const stats: Record<string, Record<string, number>> = {};

  for (const [name, queue] of queues) {
    try {
      const counts = await queue.getJobCounts(
        'waiting', 'active', 'completed', 'failed', 'delayed',
      );
      stats[name] = counts;
    } catch {
      stats[name] = { error: -1 };
    }
  }

  return stats;
}

// ── Lifecycle ───────────────────────────────────────────────────────

/**
 * Close all queue producers. Call during graceful shutdown AFTER
 * stopping all workers, but BEFORE closing the IORedis connection.
 *
 * In C#, this is like calling bus.StopAsync() on your MassTransit bus.
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.entries()).map(async ([name, queue]) => {
    try {
      await queue.close();
      // eslint-disable-next-line no-console
      console.log(`[Queues] Closed queue: ${name}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Queues] Error closing queue "${name}":`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  await Promise.all(closePromises);
}

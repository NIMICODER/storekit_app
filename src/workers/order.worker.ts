// ── src/workers/order.worker.ts ── Order Job Consumer ────────────────
//
// Processes order-related background jobs: status change side effects.
//
// When an order status changes, multiple things need to happen:
//   1. Send email notification to customer
//   2. (Future) Trigger webhook to external systems
//   3. (Future) Update analytics/metrics
//
// This worker orchestrates those side effects by dispatching to
// other queues (email, webhook) — it's a coordinator, not a doer.
//
// In C#, this is like a Saga/Orchestrator pattern in MassTransit:
//   public class OrderStatusChangedSaga : MassTransitStateMachine<OrderState>

import { Worker, Job } from 'bullmq';
import bullMQConnection from '../config/bullmq';
import { env } from '../config/env';
import { QUEUE_NAMES, JOB_NAMES } from '../types/jobs';
import type { ProcessOrderStatusPayload } from '../types/jobs';
import { queueOrderStatusUpdate } from '../queues/email.queue';

// ── Job Processor ───────────────────────────────────────────────────

async function processOrderJob(job: Job): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[OrderWorker] Processing job ${job.id} (${job.name})`);

  switch (job.name) {
    case JOB_NAMES.PROCESS_ORDER_STATUS: {
      const data = job.data as ProcessOrderStatusPayload;
      await handleOrderStatusChange(data);
      break;
    }

    default:
      // eslint-disable-next-line no-console
      console.warn(`[OrderWorker] Unknown job name: ${job.name}`);
  }
}

// ── Handlers ────────────────────────────────────────────────────────

/**
 * Handle an order status change by dispatching side effects.
 *
 * Currently dispatches an email notification. Future phases will add
 * webhook notifications, analytics events, etc.
 */
async function handleOrderStatusChange(data: ProcessOrderStatusPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[OrderWorker] Order ${data.orderId}: ${data.oldStatus} → ${data.newStatus}`,
  );

  // ── Side Effect 1: Email Notification ──────────────────────────
  // Queue an email to notify the customer of the status change.
  await queueOrderStatusUpdate({
    orderId: data.orderId,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    oldStatus: data.oldStatus,
    newStatus: data.newStatus,
  });

  // ── Side Effect 2: Webhook (Future — Phase 11) ────────────────
  // await queueWebhookNotification({ event: 'order.status_changed', ... });

  // ── Side Effect 3: Analytics (Future) ─────────────────────────
  // await trackOrderMetric(data.orderId, data.newStatus);
}

// ── Worker Instance ─────────────────────────────────────────────────

let orderWorker: Worker | null = null;

/**
 * Start the order worker.
 */
export function startOrderWorker(): Worker | null {
  if (!bullMQConnection) {
    // eslint-disable-next-line no-console
    console.warn('[OrderWorker] Cannot start — no Redis connection');
    return null;
  }

  orderWorker = new Worker(
    QUEUE_NAMES.ORDER,
    processOrderJob,
    {
      connection: bullMQConnection,
      concurrency: env.bullConcurrency,
    },
  );

  orderWorker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[OrderWorker] Job ${job.id} (${job.name}) completed`);
  });

  orderWorker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[OrderWorker] Job ${job?.id} (${job?.name}) failed:`,
      error.message,
    );
  });

  // eslint-disable-next-line no-console
  console.log('[OrderWorker] Started (listening on "order" queue)');

  return orderWorker;
}

/**
 * Gracefully stop the order worker.
 */
export async function stopOrderWorker(): Promise<void> {
  if (orderWorker) {
    await orderWorker.close();
    // eslint-disable-next-line no-console
    console.log('[OrderWorker] Stopped');
  }
}

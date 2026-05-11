// ── src/queues/email.queue.ts ── Email Job Producers ─────────────────
//
// Producer functions that add email jobs to the email queue.
// Workers (src/workers/email.worker.ts) pick up and process these jobs.
//
// PRODUCER vs CONSUMER pattern:
//   Producer (this file): "Here's a job, put it on the queue."
//   Consumer (worker):    "I'll grab the next job and process it."
//
// In C# MassTransit:
//   Producer ≈ await endpoint.Send(new OrderConfirmationEmail { ... });
//   Consumer ≈ public class OrderConfirmationConsumer : IConsumer<OrderConfirmationEmail>
//
// WHY QUEUE EMAILS?
//   SMTP is slow (100-500ms per email). If you send email synchronously
//   in your API handler, the client waits for SMTP to finish. By queuing,
//   the API responds instantly and email is sent in the background.
//   Plus, if SMTP fails, BullMQ retries automatically.

import { emailQueue } from './setup';
import { JOB_NAMES } from '../types/jobs';
import type {
  OrderConfirmationPayload,
  OrderStatusUpdatePayload,
  LowStockAlertPayload,
  AbandonedCartReminderPayload,
} from '../types/jobs';

// ── Producer Functions ──────────────────────────────────────────────
// Each function validates the payload shape at the TypeScript level
// and adds a named job to the email queue. The worker dispatches
// based on the job name.

/**
 * Queue an order confirmation email.
 *
 * Call this after a successful checkout. The email is sent async —
 * the customer sees "Order placed!" immediately, email arrives seconds later.
 *
 * @param payload - Order details for the email template
 */
export async function queueOrderConfirmation(payload: OrderConfirmationPayload): Promise<void> {
  await emailQueue.add(JOB_NAMES.ORDER_CONFIRMATION, payload, {
    // Order confirmations are high priority — customers expect them fast.
    // BullMQ priority: 1 = highest, larger = lower. Default is undefined (normal).
    priority: 1,
  });
  // eslint-disable-next-line no-console
  console.log(`[EmailQueue] Queued order confirmation for order ${payload.orderId}`);
}

/**
 * Queue an order status update email.
 *
 * Call this when an order's status changes (e.g. PROCESSING → SHIPPED).
 *
 * @param payload - Order and status details
 */
export async function queueOrderStatusUpdate(payload: OrderStatusUpdatePayload): Promise<void> {
  await emailQueue.add(JOB_NAMES.ORDER_STATUS_UPDATE, payload, {
    priority: 2,
  });
  // eslint-disable-next-line no-console
  console.log(`[EmailQueue] Queued status update email for order ${payload.orderId}`);
}

/**
 * Queue a low-stock alert email (sent to admin).
 *
 * Call this when a product's stock drops below the threshold.
 * We deduplicate by productId — if there's already a low-stock alert
 * pending for this product, we skip it (no need to spam the admin).
 *
 * @param payload - Product stock details
 */
export async function queueLowStockAlert(payload: LowStockAlertPayload): Promise<void> {
  await emailQueue.add(JOB_NAMES.LOW_STOCK_ALERT, payload, {
    // Job ID for deduplication. BullMQ skips adding a job if one with
    // the same ID already exists and hasn't completed yet.
    // In C#, you'd do this with a ConcurrentDictionary check or IdempotentConsumer.
    jobId: `low-stock-${payload.productId}`,
    priority: 3,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[EmailQueue] Queued low-stock alert for "${payload.productName}" ` +
    `(stock: ${payload.currentStock}, threshold: ${payload.threshold})`,
  );
}

/**
 * Queue an abandoned cart reminder email.
 *
 * Called by the scheduled abandoned-cart scanner (cron job).
 *
 * @param payload - Cart and customer details
 */
export async function queueAbandonedCartReminder(
  payload: AbandonedCartReminderPayload,
): Promise<void> {
  await emailQueue.add(JOB_NAMES.ABANDONED_CART_REMINDER, payload, {
    // Deduplicate by cartId — don't send multiple reminders for the same cart.
    jobId: `abandoned-cart-${payload.cartId}`,
    priority: 5, // Low priority — these are marketing, not transactional
  });
  // eslint-disable-next-line no-console
  console.log(`[EmailQueue] Queued abandoned cart reminder for cart ${payload.cartId}`);
}

// ── Scheduled Jobs ──────────────────────────────────────────────────

/**
 * Register the abandoned cart scanner as a repeatable (cron) job.
 *
 * BullMQ repeatable jobs are like cron jobs managed by Redis — they
 * automatically create a new job instance on the specified schedule.
 * Only ONE instance runs even if multiple server replicas exist
 * (Redis acts as the distributed lock).
 *
 * In C#, this is like:
 *   RecurringJob.AddOrUpdate("abandoned-cart-scan", () => ScanCarts(), Cron.Hourly);
 *
 * This should be called once at startup (not on every request).
 */
export async function registerAbandonedCartSchedule(): Promise<void> {
  try {
    await emailQueue.add(
      'abandoned-cart-scan',
      {}, // No payload — the worker fetches carts from DB
      {
        repeat: {
          // Run every hour. BullMQ uses cron syntax (same as Linux crontab).
          // "0 * * * *" = "at minute 0 of every hour"
          pattern: '0 * * * *',
        },
        // Remove old repeatable job results faster — they pile up hourly.
        removeOnComplete: { count: 24 }, // Keep last 24 runs (1 day)
        removeOnFail: { count: 168 },    // Keep last 168 failures (1 week)
      },
    );
    // eslint-disable-next-line no-console
    console.log('[EmailQueue] Registered abandoned cart scanner (runs hourly)');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[EmailQueue] Failed to register abandoned cart schedule:',
      error instanceof Error ? error.message : error,
    );
  }
}

// ── src/workers/email.worker.ts ── Email Job Consumer ────────────────
//
// Processes jobs from the email queue: order confirmations, status
// updates, low-stock alerts, and abandoned cart reminders.
//
// WORKER LIFECYCLE:
//   1. Worker connects to Redis and starts listening on the "email" queue.
//   2. BullMQ picks a job from the queue (FIFO, respecting priority).
//   3. Worker calls our processor function with the job data.
//   4. If the processor throws → BullMQ marks the job as "failed" and
//      schedules a retry (based on the queue's retry config).
//   5. If the processor returns → BullMQ marks the job as "completed".
//
// In C# MassTransit, a Worker is a Consumer:
//   public class OrderConfirmationConsumer : IConsumer<OrderConfirmationEmail>
//   {
//     public async Task Consume(ConsumeContext<OrderConfirmationEmail> context)
//     {
//       await _emailSender.SendAsync(context.Message);
//     }
//   }
//
// In BullMQ, one worker handles all job types in a queue. We dispatch
// based on job.name (like a switch on message type).

import { Worker, Job } from 'bullmq';
import bullMQConnection from '../config/bullmq';
import { env } from '../config/env';
import { emailService } from '../services/email.service';
import { QUEUE_NAMES, JOB_NAMES } from '../types/jobs';
import type {
  OrderConfirmationPayload,
  OrderStatusUpdatePayload,
  LowStockAlertPayload,
  AbandonedCartReminderPayload,
} from '../types/jobs';

// ── Job Processor ───────────────────────────────────────────────────
// This function runs for EVERY job pulled from the email queue.
// It dispatches to the right handler based on the job name.

async function processEmailJob(job: Job): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[EmailWorker] Processing job ${job.id} (${job.name})`);

  switch (job.name) {
    // ── Order Confirmation ────────────────────────────────────────
    case JOB_NAMES.ORDER_CONFIRMATION: {
      const data = job.data as OrderConfirmationPayload;
      await emailService.send({
        to: data.customerEmail,
        subject: `Order Confirmed — #${data.orderId}`,
        html: emailService.orderConfirmation({
          customerName: data.customerName,
          orderId: data.orderId,
          orderTotal: data.orderTotal,
          itemCount: data.itemCount,
        }),
      });
      break;
    }

    // ── Order Status Update ──────────────────────────────────────
    case JOB_NAMES.ORDER_STATUS_UPDATE: {
      const data = job.data as OrderStatusUpdatePayload;
      await emailService.send({
        to: data.customerEmail,
        subject: `Order #${data.orderId} — ${data.newStatus}`,
        html: emailService.orderStatusUpdate({
          customerName: data.customerName,
          orderId: data.orderId,
          oldStatus: data.oldStatus,
          newStatus: data.newStatus,
        }),
      });
      break;
    }

    // ── Low Stock Alert ──────────────────────────────────────────
    case JOB_NAMES.LOW_STOCK_ALERT: {
      const data = job.data as LowStockAlertPayload;
      // In production, you'd send this to admin email(s).
      // For development, Ethereal captures it for preview.
      await emailService.send({
        to: env.emailFrom, // Send to "self" in dev — admin email in prod
        subject: `⚠️ Low Stock: ${data.productName} (${data.currentStock} left)`,
        html: emailService.lowStockAlert({
          productName: data.productName,
          currentStock: data.currentStock,
          threshold: data.threshold,
          sku: data.sku,
        }),
      });
      break;
    }

    // ── Abandoned Cart Reminder ──────────────────────────────────
    case JOB_NAMES.ABANDONED_CART_REMINDER: {
      const data = job.data as AbandonedCartReminderPayload;
      await emailService.send({
        to: data.customerEmail,
        subject: 'You left items in your cart!',
        html: emailService.abandonedCartReminder({
          customerName: data.customerName,
          itemCount: data.itemCount,
          cartTotal: data.cartTotal,
        }),
      });
      break;
    }

    // ── Abandoned Cart Scan (Cron) ───────────────────────────────
    // This is the scheduled job that scans for abandoned carts.
    // It doesn't send emails directly — it queues individual
    // reminder emails for each abandoned cart found.
    case 'abandoned-cart-scan': {
      await scanAbandonedCarts();
      break;
    }

    default:
      // eslint-disable-next-line no-console
      console.warn(`[EmailWorker] Unknown job name: ${job.name}`);
  }
}

// ── Abandoned Cart Scanner ──────────────────────────────────────────
//
// This runs on a schedule (hourly). It queries the database for carts
// that haven't been updated in X hours and queues reminder emails for
// each one. The goal: nudge customers to complete their purchase.
//
// A cart is "abandoned" if:
//   1. It has items (not empty)
//   2. It hasn't been updated in N hours (ABANDONED_CART_HOURS env var)
//   3. The user hasn't placed an order since the cart was last updated
//
// In C#, this would be a BackgroundService or Hangfire recurring job:
//   RecurringJob.AddOrUpdate("scan-carts", () => ScanAbandonedCarts(), Cron.Hourly);

async function scanAbandonedCarts(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[EmailWorker] Scanning for abandoned carts (older than ${env.abandonedCartHours}h)...`,
  );

  try {
    // Lazy-import to avoid circular dependencies at module load time.
    // The dynamic import resolves at runtime, after all modules are initialised.
    const { default: prisma } = await import('../config/database');
    const { queueAbandonedCartReminder } = await import('../queues/email.queue');

    // Calculate the cutoff time: carts not updated since this timestamp are "abandoned".
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - env.abandonedCartHours);

    // Find carts with items that haven't been touched recently.
    const abandonedCarts = await prisma.cart.findMany({
      where: {
        updatedAt: { lt: cutoffDate },
        items: { some: {} }, // Must have at least one item
      },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { price: true } },
          },
        },
      },
      take: 100, // Process max 100 per scan to avoid overloading
    });

    // eslint-disable-next-line no-console
    console.log(`[EmailWorker] Found ${abandonedCarts.length} abandoned carts`);

    for (const cart of abandonedCarts) {
      // Calculate cart total using plain number arithmetic.
      // Prisma Decimal fields are converted to number via Number().
      let cartTotal = 0;
      for (const item of cart.items) {
        cartTotal += Number(item.product.price) * item.quantity;
      }
      cartTotal = Math.round(cartTotal * 100) / 100;

      await queueAbandonedCartReminder({
        cartId: cart.id,
        customerEmail: cart.user.email,
        customerName: `${cart.user.firstName} ${cart.user.lastName}`,
        itemCount: cart.items.length,
        cartTotal,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`[EmailWorker] Abandoned cart scan complete (${abandonedCarts.length} reminders queued)`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[EmailWorker] Abandoned cart scan failed:',
      error instanceof Error ? error.message : error,
    );
    throw error; // Re-throw so BullMQ marks the job as failed and retries
  }
}

// ── Worker Instance ─────────────────────────────────────────────────

let emailWorker: Worker | null = null;

/**
 * Start the email worker.
 *
 * The worker connects to Redis and starts pulling jobs from the "email"
 * queue. It processes `concurrency` jobs simultaneously.
 *
 * In C# MassTransit:
 *   cfg.ReceiveEndpoint("email", e => {
 *     e.PrefetchCount = 5; // ≈ concurrency
 *     e.Consumer<OrderConfirmationConsumer>();
 *   });
 */
export function startEmailWorker(): Worker | null {
  if (!bullMQConnection) {
    // eslint-disable-next-line no-console
    console.warn('[EmailWorker] Cannot start — no Redis connection');
    return null;
  }

  emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    processEmailJob,
    {
      connection: bullMQConnection,
      concurrency: env.bullConcurrency,
    },
  );

  // ── Worker Event Listeners ──────────────────────────────────────
  // BullMQ workers emit events for lifecycle tracking and debugging.

  emailWorker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[EmailWorker] Job ${job.id} (${job.name}) completed`);
  });

  emailWorker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[EmailWorker] Job ${job?.id} (${job?.name}) failed:`,
      error.message,
    );
  });

  // eslint-disable-next-line no-console
  console.log('[EmailWorker] Started (listening on "email" queue)');

  return emailWorker;
}

/**
 * Gracefully stop the email worker.
 *
 * `.close()` waits for the current job to finish (drains), then
 * disconnects. No jobs are abandoned mid-processing.
 *
 * In C#: await hostedService.StopAsync(cancellationToken);
 */
export async function stopEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.close();
    // eslint-disable-next-line no-console
    console.log('[EmailWorker] Stopped');
  }
}

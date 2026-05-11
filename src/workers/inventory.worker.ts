// ── src/workers/inventory.worker.ts ── Inventory Job Consumer ────────
//
// Processes inventory-related background jobs: low-stock detection
// and alert dispatching.
//
// FLOW:
//   1. Product service updates stock → dispatches CHECK_LOW_STOCK job
//   2. This worker picks up the job
//   3. Compares current stock against the threshold
//   4. If stock is low → queues a LOW_STOCK_ALERT email job
//
// WHY TWO STEPS (inventory check → email)?
//   Separation of concerns. The inventory worker decides IF an alert
//   is needed. The email worker handles HOW to send it. If email sending
//   fails, the inventory check is already done — no repeated checks.
//
// In C#, this is like a chain of MediatR handlers:
//   StockUpdated → CheckLowStockHandler → LowStockAlertHandler

import { Worker, Job } from 'bullmq';
import bullMQConnection from '../config/bullmq';
import { env } from '../config/env';
import { QUEUE_NAMES, JOB_NAMES } from '../types/jobs';
import type { CheckLowStockPayload } from '../types/jobs';
import { queueLowStockAlert } from '../queues/email.queue';

// ── Job Processor ───────────────────────────────────────────────────

async function processInventoryJob(job: Job): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[InventoryWorker] Processing job ${job.id} (${job.name})`);

  switch (job.name) {
    case JOB_NAMES.CHECK_LOW_STOCK: {
      const data = job.data as CheckLowStockPayload;
      await handleLowStockCheck(data);
      break;
    }

    default:
      // eslint-disable-next-line no-console
      console.warn(`[InventoryWorker] Unknown job name: ${job.name}`);
  }
}

// ── Handlers ────────────────────────────────────────────────────────

/**
 * Check if a product's stock is below the threshold and dispatch an alert.
 *
 * The threshold comes from env.LOW_STOCK_THRESHOLD (default: 10).
 * This is configurable per environment — staging might use 5, prod uses 10.
 */
async function handleLowStockCheck(data: CheckLowStockPayload): Promise<void> {
  const threshold = env.lowStockThreshold;

  if (data.currentStock <= threshold) {
    // Stock is low — dispatch an alert email to the admin.
    // eslint-disable-next-line no-console
    console.log(
      `[InventoryWorker] LOW STOCK: "${data.productName}" has ${data.currentStock} units ` +
      `(threshold: ${threshold}). Dispatching alert email.`,
    );

    await queueLowStockAlert({
      productId: data.productId,
      productName: data.productName,
      currentStock: data.currentStock,
      threshold,
      sku: data.sku,
    });
  } else {
    // Stock is fine — no action needed.
    // eslint-disable-next-line no-console
    console.log(
      `[InventoryWorker] Stock OK: "${data.productName}" has ${data.currentStock} units ` +
      `(threshold: ${threshold})`,
    );
  }
}

// ── Worker Instance ─────────────────────────────────────────────────

let inventoryWorker: Worker | null = null;

/**
 * Start the inventory worker.
 */
export function startInventoryWorker(): Worker | null {
  if (!bullMQConnection) {
    // eslint-disable-next-line no-console
    console.warn('[InventoryWorker] Cannot start — no Redis connection');
    return null;
  }

  inventoryWorker = new Worker(
    QUEUE_NAMES.INVENTORY,
    processInventoryJob,
    {
      connection: bullMQConnection,
      // Inventory checks are fast and lightweight — no need for high concurrency.
      concurrency: 3,
    },
  );

  inventoryWorker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[InventoryWorker] Job ${job.id} (${job.name}) completed`);
  });

  inventoryWorker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[InventoryWorker] Job ${job?.id} (${job?.name}) failed:`,
      error.message,
    );
  });

  // eslint-disable-next-line no-console
  console.log('[InventoryWorker] Started (listening on "inventory" queue)');

  return inventoryWorker;
}

/**
 * Gracefully stop the inventory worker.
 */
export async function stopInventoryWorker(): Promise<void> {
  if (inventoryWorker) {
    await inventoryWorker.close();
    // eslint-disable-next-line no-console
    console.log('[InventoryWorker] Stopped');
  }
}

// ── src/queues/inventory.queue.ts ── Inventory Job Producers ─────────
//
// Dispatches inventory-related background jobs: low-stock checks,
// reorder triggers, etc.
//
// WHY CHECK STOCK IN A BACKGROUND JOB?
//   The product update API should respond fast. Stock checking might
//   involve querying related products, checking reorder rules, sending
//   alerts — all slow operations. By queuing, the API stays snappy.
//
// In C#, this is like publishing a domain event:
//   await _mediator.Publish(new StockUpdatedEvent(productId, newStock));
//   ...and handling it in a background hosted service.

import { inventoryQueue } from './setup';
import { JOB_NAMES } from '../types/jobs';
import type { CheckLowStockPayload } from '../types/jobs';

/**
 * Queue a low-stock check for a product.
 *
 * Call this whenever a product's stock is updated. The worker will
 * compare the current stock against the threshold and dispatch an
 * alert email if needed.
 *
 * @param payload - Product ID, name, and current stock
 */
export async function queueLowStockCheck(payload: CheckLowStockPayload): Promise<void> {
  await inventoryQueue.add(JOB_NAMES.CHECK_LOW_STOCK, payload, {
    // Deduplicate by productId — if a stock check is already pending
    // for this product, don't add another one.
    jobId: `check-stock-${payload.productId}`,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[InventoryQueue] Queued stock check for "${payload.productName}" (stock: ${payload.currentStock})`,
  );
}

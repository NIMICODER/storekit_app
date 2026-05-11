// ── src/queues/order.queue.ts ── Order Job Producers ─────────────────
//
// Dispatches order-related background jobs: status change processing,
// analytics events, etc.
//
// WHY QUEUE ORDER STATUS CHANGES?
//   When an order moves to "SHIPPED", multiple things happen:
//   - Send status update email to customer
//   - Update analytics/metrics
//   - Trigger webhook notifications
//   By queuing, each side effect is processed independently and can
//   retry independently if it fails.
//
// In C#, this is like raising a domain event:
//   await _mediator.Publish(new OrderStatusChangedEvent(order, oldStatus, newStatus));

import { orderQueue } from './setup';
import { JOB_NAMES } from '../types/jobs';
import type { ProcessOrderStatusPayload } from '../types/jobs';

/**
 * Queue an order status change for processing.
 *
 * This triggers side effects: email notifications, webhook calls, etc.
 * Call this after updating an order's status in the database.
 *
 * @param payload - Order ID, customer info, old/new status
 */
export async function queueOrderStatusChange(payload: ProcessOrderStatusPayload): Promise<void> {
  await orderQueue.add(JOB_NAMES.PROCESS_ORDER_STATUS, payload);
  // eslint-disable-next-line no-console
  console.log(
    `[OrderQueue] Queued status change for order ${payload.orderId}: ` +
    `${payload.oldStatus} → ${payload.newStatus}`,
  );
}

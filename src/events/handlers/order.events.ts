// ── src/events/handlers/order.events.ts ── Order Event Handlers ───────
//
// Listens to order lifecycle events and dispatches side effects:
//   - order.created → queue confirmation email
//   - order.statusChanged → queue status update email
//
// These handlers are the "glue" between the event bus (in-process) and
// the BullMQ queue system (async background processing). The handler
// itself is lightweight — it just adds a job to the queue and returns.
// The actual email sending happens in the email worker.
//
// WHY NOT SEND EMAIL DIRECTLY IN THE EVENT HANDLER?
//   1. Speed: SMTP is slow (100-500ms). Event handlers should be fast.
//   2. Resilience: If SMTP is down, the queue retries. Direct calls fail.
//   3. Separation: The event handler says "what" (send email), the worker
//      handles "how" (SMTP connection, retries, rate limiting).
//
// .NET COMPARISON:
//   In C#, this is like a MediatR notification handler that publishes
//   to MassTransit or Hangfire:
//
//   public class OrderCreatedHandler : INotificationHandler<OrderCreatedEvent>
//   {
//     private readonly IBackgroundJobClient _jobs;
//     public async Task Handle(OrderCreatedEvent notification, CancellationToken ct)
//     {
//       _jobs.Enqueue<IEmailSender>(x => x.SendOrderConfirmation(notification));
//     }
//   }

import { eventBus } from '../eventBus';
import { EVENT_NAMES } from '../types';
import type { OrderCreatedPayload, OrderStatusChangedPayload } from '../types';
import { queueOrderConfirmation, queueOrderStatusUpdate } from '../../queues/email.queue';

// ── Handler: order.created → Queue Confirmation Email ─────────────────
//
// When a new order is created (checkout completes), we queue an order
// confirmation email. The customer sees "Order placed!" immediately,
// and the email arrives seconds later in the background.

function handleOrderCreated(payload: OrderCreatedPayload): void {
  // eslint-disable-next-line no-console
  console.log(`[OrderEvents] order.created → queuing confirmation for ${payload.orderNumber}`);

  // Fire-and-forget: queue the email job, don't await.
  // If queuing fails, we log the error but don't crash — the order
  // is already saved in the database (the critical path succeeded).
  queueOrderConfirmation({
    orderId: payload.orderNumber,
    customerEmail: payload.customerEmail,
    customerName: payload.customerName,
    orderTotal: payload.orderTotal,
    itemCount: payload.itemCount,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[OrderEvents] Failed to queue confirmation email:', err);
  });
}

// ── Handler: order.statusChanged → Queue Status Update Email ──────────
//
// When an admin changes an order's status (e.g. PROCESSING → SHIPPED),
// notify the customer by email. Same fire-and-forget pattern.

function handleOrderStatusChanged(payload: OrderStatusChangedPayload): void {
  // eslint-disable-next-line no-console
  console.log(
    `[OrderEvents] order.statusChanged → ${payload.oldStatus} → ${payload.newStatus} ` +
    `for ${payload.orderNumber}`,
  );

  queueOrderStatusUpdate({
    orderId: payload.orderNumber,
    customerEmail: payload.customerEmail,
    customerName: payload.customerName,
    oldStatus: payload.oldStatus,
    newStatus: payload.newStatus,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[OrderEvents] Failed to queue status update email:', err);
  });
}

// ── Registration ─────────────────────────────────────────────────────
// Called once at startup from src/events/index.ts.
// In C#, MediatR auto-discovers handlers via DI scanning. In Node.js,
// we register manually — explicit is better than magic.

export function registerOrderEvents(): void {
  eventBus.on(EVENT_NAMES.ORDER_CREATED, handleOrderCreated);
  eventBus.on(EVENT_NAMES.ORDER_STATUS_CHANGED, handleOrderStatusChanged);

  // eslint-disable-next-line no-console
  console.log('[OrderEvents] Registered: order.created, order.statusChanged');
}

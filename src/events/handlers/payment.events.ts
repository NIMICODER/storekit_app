// ── src/events/handlers/payment.events.ts ── Payment Event Handlers ──
//
// Listens to payment events (triggered by webhook processing) and
// updates order status accordingly:
//   - payment.completed → set order to CONFIRMED
//   - payment.failed → set order to CANCELLED
//
// This is the bridge between external payment providers (Paystack, Stripe)
// and our internal order lifecycle. The webhook handler verifies the
// payment, emits an event, and this handler does the order state change.
//
// WHY EVENTS INSTEAD OF DIRECT CALLS?
//   The webhook service shouldn't import the order repository — that
//   would create a tight coupling between payment and order concerns.
//   Events let us add more side effects later (analytics, notifications,
//   fraud detection) without touching the webhook code.
//
// .NET COMPARISON:
//   public class PaymentCompletedHandler : INotificationHandler<PaymentCompletedEvent>
//   {
//     private readonly IOrderRepository _orders;
//     public async Task Handle(PaymentCompletedEvent evt, CancellationToken ct)
//     {
//       var order = await _orders.GetByIdAsync(evt.OrderId);
//       order.Status = OrderStatus.Confirmed;
//       await _orders.UpdateAsync(order);
//     }
//   }

import { eventBus } from '../eventBus';
import { EVENT_NAMES } from '../types';
import type { PaymentCompletedPayload, PaymentFailedPayload } from '../types';
import prisma from '../../config/database';

// ── Handler: payment.completed → Confirm Order ───────────────────────
//
// When a payment provider confirms payment (via webhook), we move the
// order from PENDING to CONFIRMED. The customer can now expect fulfillment.

async function handlePaymentCompleted(payload: PaymentCompletedPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[PaymentEvents] payment.completed → confirming order ${payload.orderId} ` +
    `(payment: ${payload.providerPaymentId})`,
  );

  try {
    await prisma.order.update({
      where: { id: payload.orderId },
      data: { status: 'CONFIRMED' },
    });

    // eslint-disable-next-line no-console
    console.log(`[PaymentEvents] Order ${payload.orderId} confirmed`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[PaymentEvents] Failed to confirm order ${payload.orderId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

// ── Handler: payment.failed → Cancel Order ───────────────────────────
//
// If the payment provider says the payment failed (insufficient funds,
// card declined, etc.), we cancel the order. In a real system, you might
// also restore the reserved stock here.

async function handlePaymentFailed(payload: PaymentFailedPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[PaymentEvents] payment.failed → cancelling order ${payload.orderId} ` +
    `(reason: ${payload.reason ?? 'unknown'})`,
  );

  try {
    // Cancel the order and restore stock in a transaction.
    // This ensures atomicity — either both happen or neither does.
    await prisma.$transaction(async (tx) => {
      // 1. Get order items to know how much stock to restore
      const order = await tx.order.findUnique({
        where: { id: payload.orderId },
        include: { items: true },
      });

      if (!order) {
        // eslint-disable-next-line no-console
        console.warn(`[PaymentEvents] Order ${payload.orderId} not found — skipping cancel`);
        return;
      }

      // 2. Only cancel if still PENDING (idempotency)
      if (order.status !== 'PENDING') {
        // eslint-disable-next-line no-console
        console.warn(
          `[PaymentEvents] Order ${payload.orderId} is ${order.status}, not PENDING — skipping`,
        );
        return;
      }

      // 3. Cancel the order
      await tx.order.update({
        where: { id: payload.orderId },
        data: { status: 'CANCELLED' },
      });

      // 4. Restore stock for each item
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    // eslint-disable-next-line no-console
    console.log(`[PaymentEvents] Order ${payload.orderId} cancelled, stock restored`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[PaymentEvents] Failed to cancel order ${payload.orderId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

// ── Registration ─────────────────────────────────────────────────────

export function registerPaymentEvents(): void {
  eventBus.on(EVENT_NAMES.PAYMENT_COMPLETED, handlePaymentCompleted);
  eventBus.on(EVENT_NAMES.PAYMENT_FAILED, handlePaymentFailed);

  // eslint-disable-next-line no-console
  console.log('[PaymentEvents] Registered: payment.completed, payment.failed');
}

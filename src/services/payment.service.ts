// ── src/services/payment.service.ts ── Payment Business Logic ─────────
//
// Handles payment processing:
//   - Payment initiation (mock provider for dev)
//   - Processing webhook callbacks from payment providers
//   - Generating mock webhook payloads for testing
//
// MOCK PAYMENT PROVIDER (Development):
//   Since we don't have real Stripe/Paystack credentials, the payment
//   service generates mock payment IDs and provides a "simulate" endpoint
//   that generates a signed webhook payload. This lets you test the
//   full flow (checkout → webhook → order confirmed) without a real
//   payment provider.
//
// REAL PROVIDER (Production):
//   In production, you'd replace the mock payment initiation with a real
//   API call to Stripe/Paystack/PayPal. The webhook processing code
//   stays the same — it's provider-agnostic.
//
// .NET COMPARISON:
//   public interface IPaymentService
//   {
//     Task<PaymentInitiation> InitiatePaymentAsync(Order order);
//     Task ProcessWebhookAsync(string providerPaymentId, string status, object metadata);
//     Task<MockWebhookPayload> GenerateMockWebhookAsync(string orderId);
//   }

import crypto from 'crypto';
import { paymentRepository } from '../repositories/payment.repository';
import { NotFoundError, BadRequestError } from '../errors';
import { eventBus, EVENT_NAMES } from '../events';
import { env } from '../config/env';

// ── Payment Service Class ────────────────────────────────────────────

class PaymentService {
  /**
   * Process a payment status update (called by webhook handler).
   *
   * This method:
   *   1. Looks up the payment by provider payment ID
   *   2. Updates the payment status
   *   3. Emits the appropriate event (payment.completed or payment.failed)
   *
   * @param providerPaymentId - The payment provider's unique ID
   * @param status - New status from the provider (succeeded, failed)
   * @param metadata - Raw data from the provider for auditing
   */
  async processPaymentUpdate(
    providerPaymentId: string,
    status: 'succeeded' | 'failed',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: Record<string, any>,
  ): Promise<void> {
    // ── Find the payment ────────────────────────────────────────────
    const payment = await paymentRepository.findByProviderPaymentId(providerPaymentId);

    if (!payment) {
      throw new NotFoundError('Payment', providerPaymentId, 'providerPaymentId');
    }

    // ── Skip if already processed (idempotency) ──────────────────────
    if (payment.status !== 'PENDING') {
      // eslint-disable-next-line no-console
      console.log(
        `[PaymentService] Payment ${payment.id} already ${payment.status} — skipping`,
      );
      return;
    }

    // ── Update payment status ──────────────────────────────────────
    const newStatus = status === 'succeeded' ? 'COMPLETED' : 'FAILED';
    await paymentRepository.updateStatus(payment.id, newStatus, metadata);

    // ── Emit event for downstream handlers ────────────────────────
    // The payment event handlers (payment.events.ts) will update the
    // order status and trigger further side effects.
    if (status === 'succeeded') {
      eventBus.emit(EVENT_NAMES.PAYMENT_COMPLETED, {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        provider: payment.provider ?? 'unknown',
        providerPaymentId,
      });
    } else {
      eventBus.emit(EVENT_NAMES.PAYMENT_FAILED, {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider ?? 'unknown',
        providerPaymentId,
        reason: metadata.reason ?? 'Payment failed',
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `[PaymentService] Payment ${payment.id} → ${newStatus} ` +
      `(order: ${payment.order.orderNumber})`,
    );
  }

  /**
   * Generate a mock webhook payload for testing the full payment flow.
   *
   * DEV ONLY — In production, the payment provider sends the webhook.
   * This method creates a properly signed payload that our webhook
   * endpoint will accept, simulating what Paystack/Stripe would send.
   *
   * @param orderId - The order to simulate payment for
   * @returns Signed webhook payload ready to POST to /webhooks/payment
   */
  async generateMockWebhook(orderId: string) {
    if (!env.isDevelopment) {
      throw new BadRequestError('Mock webhooks are only available in development mode');
    }

    // Look up the payment for this order
    const payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
      throw new NotFoundError('Payment for order', orderId);
    }

    if (payment.status !== 'PENDING') {
      throw new BadRequestError(
        `Payment is already ${payment.status}. Cannot simulate again.`,
      );
    }

    // ── Build the mock webhook payload ──────────────────────────────
    // Mimics the shape of a Paystack/Stripe webhook event.
    // The important parts: eventId (idempotency), event type, and
    // the payment reference we can look up.
    const payload = {
      eventId: `evt_mock_${Date.now()}`,
      event: 'payment.success',
      data: {
        reference: payment.providerPaymentId,
        amount: Number(payment.amount) * 100, // Providers use cents
        currency: payment.currency,
        status: 'succeeded',
        paidAt: new Date().toISOString(),
        metadata: {
          orderId,
          orderNumber: payment.order.orderNumber,
        },
      },
    };

    // ── Sign the payload ──────────────────────────────────────────────
    // HMAC-SHA256 signature, same algorithm used by real providers.
    // The webhook handler will verify this signature before processing.
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', env.webhookSecret)
      .update(payloadString)
      .digest('hex');

    return {
      payload,
      signature,
      instructions: {
        method: 'POST',
        url: `/api/${env.apiVersion}/webhooks/payment`,
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body: payload,
      },
    };
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const paymentService = new PaymentService();

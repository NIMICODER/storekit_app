// ── src/services/webhook.service.ts ── Webhook Processing ─────────────
//
// Handles incoming webhook requests from payment providers:
//   1. Verify HMAC signature (proves the request is genuine)
//   2. Check idempotency (don't process the same event twice)
//   3. Log the raw event to the database
//   4. Dispatch to the appropriate service (payment)
//
// WEBHOOK SECURITY:
//   Payment providers sign their webhooks with a shared secret (HMAC-SHA256).
//   When we receive a webhook, we:
//     a) Compute HMAC of the raw request body using our secret
//     b) Compare it to the signature header the provider sent
//     c) Use crypto.timingSafeEqual() for constant-time comparison
//        (prevents timing attacks that could guess the signature byte-by-byte)
//
//   This is the same approach used by Stripe, Paystack, GitHub, etc.
//
// .NET COMPARISON:
// ──────────────────────────────────────────────────────────────────────
//   In C#/ASP.NET:
//     [HttpPost("webhooks/payment")]
//     public async Task<IActionResult> HandlePaymentWebhook()
//     {
//       var body = await new StreamReader(Request.Body).ReadToEndAsync();
//       var signature = Request.Headers["x-webhook-signature"];
//
//       using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
//       var computed = BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(body)));
//
//       if (!CryptographicOperations.FixedTimeEquals(computed, signature))
//         return Unauthorized();
//
//       // Process...
//     }
//
//   The Node.js version uses crypto.createHmac() + crypto.timingSafeEqual()
//   which maps directly to the .NET HMACSHA256 + FixedTimeEquals pattern.

import crypto from 'crypto';
import { webhookRepository } from '../repositories/webhook.repository';
import { paymentService } from './payment.service';
import { env } from '../config/env';

// ── Types ────────────────────────────────────────────────────────────

interface WebhookPayload {
  eventId: string;
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paidAt?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  };
}

// ── Webhook Service Class ────────────────────────────────────────────

class WebhookService {
  /**
   * Verify the HMAC-SHA256 signature of an incoming webhook.
   *
   * HOW HMAC VERIFICATION WORKS:
   *   1. The provider has a secret key (same one we have in WEBHOOK_SECRET).
   *   2. Before sending the webhook, the provider computes:
   *      signature = HMAC-SHA256(secret, requestBody)
   *   3. The provider includes this signature in a header.
   *   4. We compute the same HMAC on our end.
   *   5. If the signatures match → the request is genuine.
   *      If not → someone is trying to fake a webhook.
   *
   * WHY timingSafeEqual()?
   *   A normal string comparison (===) returns false as soon as it finds
   *   a difference. An attacker can time how long the comparison takes to
   *   guess the signature one character at a time (timing attack).
   *   timingSafeEqual() always takes the same amount of time, regardless
   *   of where the mismatch is. This is called "constant-time comparison".
   *
   *   In C#: CryptographicOperations.FixedTimeEquals() does the same thing.
   *
   * @param rawBody - The raw request body as a string (NOT parsed JSON!)
   * @param signature - The HMAC signature from the request header
   * @returns true if signature is valid, false otherwise
   */
  verifySignature(rawBody: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', env.webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Convert both to buffers for constant-time comparison.
    // If lengths differ, timingSafeEqual() throws — we handle that.
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Process an incoming payment webhook.
   *
   * Full pipeline:
   *   1. Verify signature
   *   2. Parse payload
   *   3. Check idempotency (skip if already processed)
   *   4. Log event to database
   *   5. Dispatch to payment service
   *   6. Mark event as processed (or failed)
   *
   * @param rawBody - Raw request body string
   * @param signature - HMAC signature from x-webhook-signature header
   * @throws Error if signature is invalid
   */
  async processPaymentWebhook(rawBody: string, signature: string): Promise<void> {
    // ── Step 1: Verify signature ────────────────────────────────────
    if (!this.verifySignature(rawBody, signature)) {
      // eslint-disable-next-line no-console
      console.error('[WebhookService] Invalid signature — rejecting webhook');
      throw new Error('Invalid webhook signature');
    }

    // eslint-disable-next-line no-console
    console.log('[WebhookService] Signature verified');

    // ── Step 2: Parse payload ───────────────────────────────────────
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      throw new Error('Invalid webhook payload — not valid JSON');
    }

    // ── Step 3: Idempotency check ────────────────────────────────────
    // If we've already processed this exact event, skip it.
    // Payment providers guarantee at-least-once delivery, which means
    // they may send the same webhook multiple times. Idempotency
    // ensures we only act on it once.
    //
    // In C#, you'd use a similar pattern with a database check:
    //   if (await _webhookRepo.ExistsAsync(source, eventId)) return;
    const alreadyProcessed = await webhookRepository.existsProcessed(
      'payment',
      payload.eventId,
    );

    if (alreadyProcessed) {
      // eslint-disable-next-line no-console
      console.log(`[WebhookService] Event ${payload.eventId} already processed — skipping`);
      return;
    }

    // ── Step 4: Log event to database ────────────────────────────────
    // Store the raw payload BEFORE processing. This ensures we have a
    // record even if processing fails — we can replay it later.
    const webhookEvent = await webhookRepository.create({
      source: 'payment',
      eventType: payload.event,
      // Cast to Prisma's JSON input type — the payload is a valid JSON object.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
    });

    // ── Step 5: Dispatch to payment service ──────────────────────────
    try {
      const status = payload.data.status === 'succeeded' ? 'succeeded' : 'failed';

      await paymentService.processPaymentUpdate(
        payload.data.reference,
        status,
        payload.data as unknown as Record<string, unknown>,
      );

      // ── Step 6a: Mark as processed ────────────────────────────────
      await webhookRepository.markProcessed(webhookEvent.id);

      // eslint-disable-next-line no-console
      console.log(
        `[WebhookService] Event ${payload.eventId} processed successfully`,
      );
    } catch (error) {
      // ── Step 6b: Mark as failed ──────────────────────────────────
      const errorMessage = error instanceof Error ? error.message : String(error);
      await webhookRepository.markFailed(webhookEvent.id, errorMessage);

      // eslint-disable-next-line no-console
      console.error(
        `[WebhookService] Event ${payload.eventId} processing failed:`,
        errorMessage,
      );

      // Re-throw so the controller can return an appropriate status code
      throw error;
    }
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const webhookService = new WebhookService();

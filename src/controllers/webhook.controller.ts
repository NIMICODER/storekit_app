// ── src/controllers/webhook.controller.ts ── Webhook HTTP Handlers ────
//
// Handles incoming webhook requests from payment providers. This is the
// entry point for external services to notify us about payment events.
//
// CRITICAL SECURITY:
//   - NO authentication middleware (webhooks don't carry JWT tokens)
//   - Instead, verified via HMAC signature (x-webhook-signature header)
//   - Raw body parsing (express.raw) to preserve exact bytes for HMAC
//   - Always return 200 quickly to acknowledge receipt
//
// WHY RAW BODY?
//   HMAC is computed on the exact bytes the provider sent. If Express
//   parses the JSON first (express.json()), whitespace and key order
//   may change — the HMAC won't match. So we use express.raw() for
//   the webhook route and parse the JSON ourselves.
//
// .NET COMPARISON:
//   In ASP.NET, you'd use [DisableRequestSizeLimit] and manually read
//   the body with Request.Body:
//
//   [HttpPost("webhooks/payment")]
//   public async Task<IActionResult> HandlePaymentWebhook()
//   {
//     using var reader = new StreamReader(Request.Body);
//     var rawBody = await reader.ReadToEndAsync();
//     var signature = Request.Headers["x-webhook-signature"];
//     // Verify HMAC...
//   }

import { Request, Response } from 'express';
import { webhookService } from '../services/webhook.service';
import { paymentService } from '../services/payment.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { env } from '../config/env';

// ── Receive Payment Webhook ──────────────────────────────────────────

/**
 * POST /api/v1/webhooks/payment
 *
 * Receives webhook callbacks from payment providers (Paystack, Stripe, etc.).
 *
 * The request body is raw (Buffer), NOT parsed JSON. The webhook route
 * uses express.raw() instead of express.json() — see app.ts for setup.
 *
 * Always returns 200 to acknowledge receipt. The provider will keep
 * retrying if it doesn't get a 200. Even if processing fails internally,
 * we return 200 and log the error — the event is stored in the DB for
 * replay.
 */
export const receivePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  // The raw body is a Buffer (set by express.raw() in app.ts).
  // Convert to string for HMAC verification and JSON parsing.
  const rawBody = typeof req.body === 'string'
    ? req.body
    : Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : JSON.stringify(req.body);

  const signature = req.headers['x-webhook-signature'] as string;

  if (!signature) {
    // Return 400, not 401 — missing signature is a client error.
    // Don't give attackers hints about what we're checking for.
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_SIGNATURE', message: 'Missing webhook signature' },
    });
    return;
  }

  try {
    await webhookService.processPaymentWebhook(rawBody, signature);

    // Always return 200 to acknowledge receipt.
    // The provider needs to know we received it — they'll stop retrying.
    res.status(200).json({ received: true });
  } catch (error) {
    // Log the error but STILL return 200 if it's a processing error.
    // If signature verification failed, return 401.
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'Invalid webhook signature') {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' },
      });
      return;
    }

    // Processing error — we stored the event, just couldn't process it.
    // Still return 200 so the provider doesn't retry endlessly.
    // eslint-disable-next-line no-console
    console.error('[WebhookController] Processing error (returning 200):', message);
    res.status(200).json({ received: true, processingError: true });
  }
});

// ── Simulate Payment Webhook (Dev Only) ──────────────────────────────

/**
 * POST /api/v1/webhooks/payment/simulate
 *
 * DEV ONLY — Generates a signed webhook payload and processes it,
 * simulating what a real payment provider would send.
 *
 * This lets you test the full flow without real Paystack/Stripe credentials:
 *   1. Checkout → order created, payment PENDING
 *   2. Call this endpoint with the orderId
 *   3. Webhook processes → payment COMPLETED → order CONFIRMED → email queued
 *
 * In production, this endpoint does NOT exist.
 */
export const simulatePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_ORDER_ID', message: 'orderId is required' },
    });
    return;
  }

  // Generate a properly signed mock webhook payload
  const mockWebhook = await paymentService.generateMockWebhook(orderId);

  // Process it through the webhook pipeline (same as a real webhook)
  const rawBody = JSON.stringify(mockWebhook.payload);
  await webhookService.processPaymentWebhook(rawBody, mockWebhook.signature);

  sendSuccess(res, {
    message: 'Payment webhook simulated successfully',
    orderId,
    paymentStatus: 'COMPLETED',
    orderStatus: 'CONFIRMED',
    webhookPayload: env.isDevelopment ? mockWebhook.payload : undefined,
  });
});

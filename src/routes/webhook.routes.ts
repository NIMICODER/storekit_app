// ── src/routes/webhook.routes.ts ── Webhook Route Definitions ─────────
//
// Incoming webhook endpoints from external services. These routes do NOT
// use authentication middleware — webhooks don't carry JWT tokens.
// Instead, they're verified via HMAC signatures in the controller/service.
//
// ROUTE STRUCTURE:
//   POST /webhooks/payment           → Receive payment provider callback
//   POST /webhooks/payment/simulate  → DEV ONLY: simulate a payment callback
//
// IMPORTANT: Raw body parsing!
//   The payment webhook route needs the raw request body (not parsed JSON)
//   for HMAC signature verification. This is configured in app.ts using
//   express.raw() on the /webhooks path BEFORE express.json().
//
// .NET COMPARISON:
//   [AllowAnonymous]  // No auth — verified by HMAC
//   [Route("api/v1/webhooks")]
//   public class WebhooksController : ControllerBase
//   {
//     [HttpPost("payment")]
//     public async Task<IActionResult> ReceivePaymentWebhook() { ... }
//   }

import { Router } from 'express';
import {
  receivePaymentWebhook,
  simulatePaymentWebhook,
} from '../controllers/webhook.controller';
import { authenticate } from '../middleware/authenticate';
import { strictLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────

/**
 * @openapi
 * /webhooks/payment:
 *   post:
 *     tags: [Webhooks]
 *     summary: Receive payment webhook from provider
 *     description: |
 *       Incoming webhook from payment provider (Paystack, Stripe, etc.).
 *       Verified via HMAC-SHA256 signature — no JWT auth needed.
 *       Requires X-Webhook-Signature header matching the raw body hash.
 *       Idempotent: duplicate events are skipped via WebhookEvent table.
 *     parameters:
 *       - in: header
 *         name: X-Webhook-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 hex digest of the raw request body
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: payment.completed
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed (or duplicate skipped)
 *       400:
 *         description: Missing or invalid signature
 *       429:
 *         description: Too many requests — rate limited
 */
// Receive real webhook from payment provider (no auth — uses HMAC)
router.post('/payment', strictLimiter, receivePaymentWebhook);

/**
 * @openapi
 * /webhooks/payment/simulate:
 *   post:
 *     tags: [Webhooks]
 *     summary: Simulate a payment webhook (dev only)
 *     description: |
 *       Generates a signed webhook payload and processes it through the
 *       same pipeline as a real webhook. Only available in development mode.
 *       Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *                 description: Order ID to simulate payment for
 *     responses:
 *       200:
 *         description: Simulated webhook processed successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found
 */
// DEV ONLY: Simulate a payment webhook (requires auth — admin only)
// This is a convenience endpoint for testing the full checkout flow
// without a real payment provider. It generates a signed webhook payload
// and processes it through the same pipeline as a real webhook.
if (env.isDevelopment) {
  router.post('/payment/simulate', authenticate, simulatePaymentWebhook);
}

export default router;

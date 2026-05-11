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
import { env } from '../config/env';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────

// Receive real webhook from payment provider (no auth — uses HMAC)
router.post('/payment', receivePaymentWebhook);

// DEV ONLY: Simulate a payment webhook (requires auth — admin only)
// This is a convenience endpoint for testing the full checkout flow
// without a real payment provider. It generates a signed webhook payload
// and processes it through the same pipeline as a real webhook.
if (env.isDevelopment) {
  router.post('/payment/simulate', authenticate, simulatePaymentWebhook);
}

export default router;

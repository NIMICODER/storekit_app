// src/routes/index.ts — Route Aggregator

import { Router } from 'express';
import healthRouter from './health';
import productRouter from './product.routes';
import categoryRouter from './category.routes';
import userRouter from './user.routes';
import authRouter from './auth.routes';
import uploadRouter from './upload.routes';
import cartRouter from './cart.routes';
import orderRouter from './order.routes';
import webhookRouter from './webhook.routes';
import { getBullBoardRouter } from '../queues/setup';
import { env } from '../config/env';

const router = Router();

// ── Mount Feature Routers ────────────────────────────────────────────────────

router.use('/health', healthRouter);
router.use('/products', productRouter);
router.use('/categories', categoryRouter);
router.use('/users', userRouter);
router.use('/auth', authRouter);

// Upload routes coexist with product CRUD at /products (different sub-paths)
router.use('/products', uploadRouter);

// ── Phase 11: Cart, Order, and Webhook Routes ────────────────────────────────
// Cart: CRUD for shopping cart items (all require auth)
// Orders: Checkout, order history, admin status updates (all require auth)
// Webhooks: Incoming payment provider callbacks (no auth — verified by HMAC)
router.use('/cart', cartRouter);
router.use('/orders', orderRouter);
router.use('/webhooks', webhookRouter);

// ── BullBoard Dashboard (dev only) ──────────────────────────────────────────
// Web UI for monitoring background job queues — see job counts, retry failed
// jobs, inspect payloads. Equivalent to Hangfire Dashboard in C#.
// Access at: http://localhost:3000/api/v1/admin/queues
// Only available in development — production should use dedicated monitoring.
if (env.isDevelopment) {
  router.use('/admin/queues', getBullBoardRouter());
}

export default router;

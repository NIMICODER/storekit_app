// src/routes/index.ts — Route Aggregator

import { Router } from 'express';
import healthRouter from './health';
import productRouter from './product.routes';
import categoryRouter from './category.routes';
import userRouter from './user.routes';
import authRouter from './auth.routes';
import uploadRouter from './upload.routes';

const router = Router();

// ── Mount Feature Routers ────────────────────────────────────────────────────

router.use('/health', healthRouter);
router.use('/products', productRouter);
router.use('/categories', categoryRouter);
router.use('/users', userRouter);
router.use('/auth', authRouter);

// Upload routes coexist with product CRUD at /products (different sub-paths)
router.use('/products', uploadRouter);

// ── Future phases ────────────────────────────────────────────────────────────
// router.use('/cart', cartRouter);          // Phase 11
// router.use('/orders', orderRouter);       // Phase 11

export default router;

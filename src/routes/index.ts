/**
 * src/routes/index.ts — Route Aggregator
 *
 * PURPOSE:
 *   This is the single file that collects ALL route modules and mounts
 *   them under their respective paths. It's the "routing table" of the API.
 *
 *   app.ts imports this ONE file and mounts it at '/api/v1'.
 *   Every new feature's routes gets added here.
 *
 * ARCHITECTURE — WHY ONE AGGREGATOR?
 * ─────────────────────────────────────────────────────────────────
 * Without this pattern, app.ts would grow to hundreds of lines as we add
 * routes for products, auth, cart, orders, etc.
 *
 * With the aggregator pattern:
 *   app.ts             → mounts this file at '/api/v1'
 *   routes/index.ts    → delegates to each feature's router
 *   routes/health.ts   → handles /api/v1/health/* routes
 *   routes/products.ts → handles /api/v1/products/* routes (Phase 4)
 *   routes/auth.ts     → handles /api/v1/auth/* routes (Phase 6)
 *   ...
 *
 * The full URL is composed of:
 *   app prefix   +  aggregator path  +  router path
 *   '/api/v1'    +  '/health'        +  '/'        = GET /api/v1/health
 *   '/api/v1'    +  '/health'        +  '/ping'     = GET /api/v1/health/ping
 *   '/api/v1'    +  '/products'      +  '/:id'      = GET /api/v1/products/:id
 *
 * C# EQUIVALENT:
 *   Similar to an "area" or a grouped route registration:
 *     app.MapGroup("/api/v1")
 *        .MapHealthChecks("/health")
 *        .MapGroup("/products").MapCrud<Product>();
 */

import { Router } from 'express';
import healthRouter from './health';
import productRouter from './product.routes';
import categoryRouter from './category.routes';
import userRouter from './user.routes';
import authRouter from './auth.routes';

// Create the main API router.
// This router is what app.ts will mount at '/api/v1'.
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Mount Feature Routers
// ─────────────────────────────────────────────────────────────────────────────
//
// router.use(path, subRouter) mounts subRouter at the given path PREFIX.
// All routes defined inside subRouter are now relative to that prefix.
//
// router.use('/health', healthRouter) means:
//   healthRouter's GET '/'     → accessible at GET /api/v1/health
//   healthRouter's GET '/ping' → accessible at GET /api/v1/health/ping

router.use('/health', healthRouter);

// Phase 4 — Resource routers (Service Layer & Repository Pattern)
// Each router handles full CRUD for its resource:
//   /products   → 6 endpoints (list, getById, getBySlug, create, update, delete)
//   /categories → 7 endpoints (list, getById, getBySlug, getProducts, create, update, delete)
//   /users      → 3 endpoints (list, getById, updateProfile)
router.use('/products', productRouter);
router.use('/categories', categoryRouter);
router.use('/users', userRouter);

// Phase 6 — Authentication & Authorization
// Public: register, login, refresh | Protected: logout, me
router.use('/auth', authRouter);

// ── Coming in future phases ──────────────────────────────────────────────────
// router.use('/cart', cartRouter);          // Phase 11
// router.use('/orders', orderRouter);       // Phase 11

export default router;

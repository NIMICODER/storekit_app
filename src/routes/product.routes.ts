/**
 * src/routes/product.routes.ts — Product Route Definitions
 *
 * PURPOSE:
 *   Maps HTTP methods + URL paths to controller functions.
 *   This is the "routing table" for products — it says:
 *     "When someone hits GET /api/v1/products, call getProducts()"
 *
 * PHASE 7 CHANGES:
 * ───────────────────────────────────────────────────────────────────────────
 *   Added: PATCH /products/:id route with patchProductSchema validation.
 *   PATCH requires at least 1 field in the body (unlike PUT which allows empty).
 *
 * ROUTE ORDER MATTERS!
 * ───────────────────────────────────────────────────────────────────────────
 *   Express matches routes TOP-TO-BOTTOM. The FIRST match wins.
 *   /slug/:slug MUST come before /:id.
 *
 * RESTFUL CONVENTIONS:
 *   GET    /products        → list (collection)
 *   GET    /products/:id    → read (single resource)
 *   POST   /products        → create
 *   PUT    /products/:id    → full update (replace)
 *   PATCH  /products/:id    → partial update (modify)    ← Phase 7 NEW
 *   DELETE /products/:id    → soft-delete
 */

import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  patchProduct,
  deleteProduct,
} from '../controllers/product.controller';
import { validate } from '../middleware/validate';
import { idParamSchema, slugParamSchema } from '../validators/common.validator';
import {
  createProductSchema,
  updateProductSchema,
  patchProductSchema,
  getProductsQuerySchema,
} from '../validators/product.validator';

// Create a new router instance for product routes.
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions (with validation middleware)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/products — List all products (paginated, filterable, sortable)
// Phase 7: now validates sort and cursor query params too
router.get('/', validate({ query: getProductsQuerySchema }), getProducts);

// GET /api/v1/products/slug/:slug — Get product by slug
// MUST be before /:id to avoid "slug" being captured as an :id value!
router.get('/slug/:slug', validate({ params: slugParamSchema }), getProductBySlug);

// GET /api/v1/products/:id — Get product by UUID
router.get('/:id', validate({ params: idParamSchema }), getProductById);

// POST /api/v1/products — Create a new product
// Phase 7: slug is now optional in createProductSchema (auto-generated from name)
router.post('/', validate({ body: createProductSchema }), createProduct);

// PUT /api/v1/products/:id — Full update (replace)
router.put('/:id', validate({ params: idParamSchema, body: updateProductSchema }), updateProduct);

// PATCH /api/v1/products/:id — Partial update (modify specific fields)
//
// Phase 7 NEW ROUTE:
// ─────────────────────────────────────────────────────────────────────────────
//   PATCH is semantically different from PUT:
//     PUT  { }              → valid (no-op update)
//     PATCH { }             → 400 error (must update at least one field)
//     PATCH { price: 29.99} → valid (only price is updated)
//
//   patchProductSchema = createProductSchema.partial() + refine(≥1 field)
//   This ensures the client sends at least one field to update.
//
//   Both PATCH and PUT use the same service method (updateProduct) —
//   the difference is purely in the validation schema.
//
// C# equivalent:
//   [HttpPatch("{id}")]
//   public async Task<IActionResult> Patch(Guid id, [FromBody] PatchProductDto dto)
router.patch('/:id', validate({ params: idParamSchema, body: patchProductSchema }), patchProduct);

// DELETE /api/v1/products/:id — Soft-delete a product
// Phase 7: now performs soft-delete (sets deletedAt) instead of hard delete
router.delete('/:id', validate({ params: idParamSchema }), deleteProduct);

export default router;

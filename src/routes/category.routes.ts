/**
 * src/routes/category.routes.ts — Category Route Definitions
 *
 * PURPOSE:
 *   Maps HTTP methods + URL paths to category controller functions.
 *   Same pattern as product.routes.ts.
 *
 * PHASE 5 — VALIDATION MIDDLEWARE:
 *   Every route now validates params, body, and/or query before the controller.
 *
 * NESTED RESOURCE ROUTE:
 * ───────────────────────────────────────────────────────────────────────────
 *   GET /categories/:id/products is a "nested resource" route.
 *   It represents: "the products that BELONG TO this category"
 *
 * ROUTE ORDER:
 *   /slug/:slug BEFORE /:id (same reason as products)
 *   /:id/products AFTER /:id (Express processes segments left-to-right)
 */

import { Router } from 'express';
import {
  getCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryProducts,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { validate } from '../middleware/validate';
import { idParamSchema, slugParamSchema } from '../validators/common.validator';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoryProductsQuerySchema,
} from '../validators/category.validator';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions (with validation middleware)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/categories — List all categories (flat or ?tree=true)
// No validation needed — tree is just a string check in the controller
router.get('/', getCategories);

// GET /api/v1/categories/slug/:slug — Get category by slug
// Validates: slug param (non-empty)
// MUST be before /:id!
router.get('/slug/:slug', validate({ params: slugParamSchema }), getCategoryBySlug);

// GET /api/v1/categories/:id — Get category by ID
// Validates: id param (UUID)
router.get('/:id', validate({ params: idParamSchema }), getCategoryById);

// GET /api/v1/categories/:id/products — Get category's products (paginated)
// Validates: id param (UUID) + query params (page, limit)
router.get(
  '/:id/products',
  validate({ params: idParamSchema, query: getCategoryProductsQuerySchema }),
  getCategoryProducts,
);

// POST /api/v1/categories — Create a new category
// Validates: body (name, slug required; description, image, parentId optional)
router.post('/', validate({ body: createCategorySchema }), createCategory);

// PUT /api/v1/categories/:id — Update a category
// Validates: id param (UUID) + body (all fields optional)
router.put('/:id', validate({ params: idParamSchema, body: updateCategorySchema }), updateCategory);

// DELETE /api/v1/categories/:id — Delete a category
// Validates: id param (UUID)
router.delete('/:id', validate({ params: idParamSchema }), deleteCategory);

export default router;

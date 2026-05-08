// src/routes/category.routes.ts — Category Route Definitions

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
import { cacheMiddleware } from '../middleware/cache';
import { idParamSchema, slugParamSchema } from '../validators/common.validator';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoryProductsQuerySchema,
} from '../validators/category.validator';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────
// Read routes use cacheMiddleware('categories') — responses are cached in Redis.
// Write routes are NOT cached, and the service layer clears the cache after writes.

router.get('/', cacheMiddleware('categories'), getCategories);

// slug route must precede /:id to avoid slug being captured as an id
router.get('/slug/:slug', validate({ params: slugParamSchema }), cacheMiddleware('categories'), getCategoryBySlug);
router.get('/:id', validate({ params: idParamSchema }), cacheMiddleware('categories'), getCategoryById);
router.get(
  '/:id/products',
  validate({ params: idParamSchema, query: getCategoryProductsQuerySchema }),
  cacheMiddleware('categories'),
  getCategoryProducts,
);

router.post('/', validate({ body: createCategorySchema }), createCategory);
router.put('/:id', validate({ params: idParamSchema, body: updateCategorySchema }), updateCategory);
router.delete('/:id', validate({ params: idParamSchema }), deleteCategory);

export default router;

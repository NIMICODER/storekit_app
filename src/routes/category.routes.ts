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
import { idParamSchema, slugParamSchema } from '../validators/common.validator';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoryProductsQuerySchema,
} from '../validators/category.validator';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────

router.get('/', getCategories);

// slug route must precede /:id to avoid slug being captured as an id
router.get('/slug/:slug', validate({ params: slugParamSchema }), getCategoryBySlug);
router.get('/:id', validate({ params: idParamSchema }), getCategoryById);
router.get(
  '/:id/products',
  validate({ params: idParamSchema, query: getCategoryProductsQuerySchema }),
  getCategoryProducts,
);

router.post('/', validate({ body: createCategorySchema }), createCategory);
router.put('/:id', validate({ params: idParamSchema, body: updateCategorySchema }), updateCategory);
router.delete('/:id', validate({ params: idParamSchema }), deleteCategory);

export default router;

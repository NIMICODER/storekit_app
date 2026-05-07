// src/routes/product.routes.ts — Product Route Definitions

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

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────

router.get('/', validate({ query: getProductsQuerySchema }), getProducts);

// slug route must precede /:id to avoid slug being captured as an id
router.get('/slug/:slug', validate({ params: slugParamSchema }), getProductBySlug);
router.get('/:id', validate({ params: idParamSchema }), getProductById);

router.post('/', validate({ body: createProductSchema }), createProduct);
router.put('/:id', validate({ params: idParamSchema, body: updateProductSchema }), updateProduct);
router.patch('/:id', validate({ params: idParamSchema, body: patchProductSchema }), patchProduct);

// Soft-deletes the product (sets deletedAt)
router.delete('/:id', validate({ params: idParamSchema }), deleteProduct);

export default router;

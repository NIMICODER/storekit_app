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
import { cacheMiddleware } from '../middleware/cache';
import { idParamSchema, slugParamSchema } from '../validators/common.validator';
import {
  createProductSchema,
  updateProductSchema,
  patchProductSchema,
  getProductsQuerySchema,
} from '../validators/product.validator';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────
// Read routes use cacheMiddleware('products') — responses are cached in Redis.
// The cache key includes the full URL + query params, so /products?page=1
// and /products?page=2 are cached separately. Write routes (POST/PUT/PATCH/DELETE)
// are NOT cached — and the service layer clears the cache after each write.

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Get all products (paginated, filterable, sortable)
 *     description: |
 *       Supports offset pagination, cursor pagination, search, price range,
 *       category filter, and multi-field sorting. Responses are cached in Redis.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (offset pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page (max 100)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Product ID cursor for cursor-based pagination
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product name or description
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category UUID
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: "Sort fields (e.g. price:asc,name:desc)"
 *     responses:
 *       200:
 *         description: Paginated list of products
 */
router.get('/', validate({ query: getProductsQuerySchema }), cacheMiddleware('products'), getProducts);

/**
 * @openapi
 * /products/slug/{slug}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Product slug (e.g. "iphone-15-pro")
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
// slug route must precede /:id to avoid slug being captured as an id
router.get('/slug/:slug', validate({ params: slugParamSchema }), cacheMiddleware('products'), getProductBySlug);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product UUID
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get('/:id', validate({ params: idParamSchema }), cacheMiddleware('products'), getProductById);

/**
 * @openapi
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     description: Auto-generates slug from name. Clears product cache after creation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, price, stock, sku]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Bluetooth Speaker
 *               description:
 *                 type: string
 *                 example: Portable wireless speaker with 12-hour battery life
 *               price:
 *                 type: number
 *                 example: 39.99
 *               stock:
 *                 type: integer
 *                 example: 50
 *               sku:
 *                 type: string
 *                 example: BT-SPK-001
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               isActive:
 *                 type: boolean
 *                 default: true
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate SKU
 */
router.post('/', validate({ body: createProductSchema }), createProduct);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product (full replacement)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               sku:
 *                 type: string
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.put('/:id', validate({ params: idParamSchema, body: updateProductSchema }), updateProduct);

/**
 * @openapi
 * /products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Partially update a product
 *     description: At least one field must be provided. Clears product cache.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product patched
 *       400:
 *         description: Empty body — at least one field required
 *       404:
 *         description: Product not found
 */
router.patch('/:id', validate({ params: idParamSchema, body: patchProductSchema }), patchProduct);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Soft-delete a product
 *     description: Sets deletedAt timestamp. Product is excluded from future queries but remains in the database.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product soft-deleted
 *       404:
 *         description: Product not found
 */
// Soft-deletes the product (sets deletedAt)
router.delete('/:id', validate({ params: idParamSchema }), deleteProduct);

export default router;

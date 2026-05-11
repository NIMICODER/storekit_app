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

/**
 * @openapi
 * /categories:
 *   get:
 *     tags: [Categories]
 *     summary: Get all categories
 *     description: Returns flat list by default. Pass ?tree=true for nested tree structure.
 *     parameters:
 *       - in: query
 *         name: tree
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Return categories as a nested tree
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/', cacheMiddleware('categories'), getCategories);

/**
 * @openapi
 * /categories/slug/{slug}:
 *   get:
 *     tags: [Categories]
 *     summary: Get category by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Category slug (e.g. "electronics")
 *     responses:
 *       200:
 *         description: Category details
 *       404:
 *         description: Category not found
 */
// slug route must precede /:id to avoid slug being captured as an id
router.get('/slug/:slug', validate({ params: slugParamSchema }), cacheMiddleware('categories'), getCategoryBySlug);

/**
 * @openapi
 * /categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Get category by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Category details
 *       404:
 *         description: Category not found
 */
router.get('/:id', validate({ params: idParamSchema }), cacheMiddleware('categories'), getCategoryById);

/**
 * @openapi
 * /categories/{id}/products:
 *   get:
 *     tags: [Categories]
 *     summary: Get products in a category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated products in the category
 *       404:
 *         description: Category not found
 */
router.get(
  '/:id/products',
  validate({ params: idParamSchema, query: getCategoryProductsQuerySchema }),
  cacheMiddleware('categories'),
  getCategoryProducts,
);

/**
 * @openapi
 * /categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a new category
 *     description: Supports nested categories via parentId field.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Wearables
 *               slug:
 *                 type: string
 *                 example: wearables
 *               description:
 *                 type: string
 *                 example: Smartwatches, fitness trackers, and more
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 description: Parent category ID for subcategories
 *     responses:
 *       201:
 *         description: Category created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate slug
 */
router.post('/', validate({ body: createCategorySchema }), createCategory);

/**
 * @openapi
 * /categories/{id}:
 *   put:
 *     tags: [Categories]
 *     summary: Update a category
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
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               parentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Category updated
 *       404:
 *         description: Category not found
 */
router.put('/:id', validate({ params: idParamSchema, body: updateCategorySchema }), updateCategory);

/**
 * @openapi
 * /categories/{id}:
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Category deleted
 *       404:
 *         description: Category not found
 */
router.delete('/:id', validate({ params: idParamSchema }), deleteCategory);

export default router;

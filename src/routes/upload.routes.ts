// src/routes/upload.routes.ts — File Upload Route Definitions

import { Router } from 'express';
import {
  uploadProductImages as uploadProductImagesHandler,
  deleteProductImage,
} from '../controllers/upload.controller';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.validator';
import { deleteImageBodySchema } from '../validators/upload.validator';
import { uploadProductImages } from '../middleware/upload';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────

/**
 * @openapi
 * /products/{id}/images:
 *   post:
 *     tags: [Products]
 *     summary: Upload product images
 *     description: |
 *       Upload up to 5 images for a product. Images are processed with Sharp
 *       (resized to 1200px full + 300px thumbnail, converted to WebP).
 *       Requires authentication.
 *     security:
 *       - bearerAuth: []
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files (JPEG, PNG, or WebP, max 5MB each)
 *     responses:
 *       200:
 *         description: Images uploaded and processed
 *       400:
 *         description: Invalid file type or size limit exceeded
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found
 */
// Validate params before Multer to avoid saving files for invalid product IDs
router.post(
  '/:id/images',
  authenticate,
  validate({ params: idParamSchema }),
  uploadProductImages(5),
  uploadProductImagesHandler,
);

/**
 * @openapi
 * /products/{id}/images:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product image
 *     description: Removes an image file from disk and the product's images array.
 *     security:
 *       - bearerAuth: []
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
 *             required: [imageUrl]
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 example: /uploads/products/abc123.webp
 *     responses:
 *       200:
 *         description: Image deleted
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product or image not found
 */
router.delete(
  '/:id/images',
  authenticate,
  validate({ params: idParamSchema, body: deleteImageBodySchema }),
  deleteProductImage,
);

export default router;

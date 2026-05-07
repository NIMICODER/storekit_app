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

// Validate params before Multer to avoid saving files for invalid product IDs
router.post(
  '/:id/images',
  authenticate,
  validate({ params: idParamSchema }),
  uploadProductImages(5),
  uploadProductImagesHandler,
);

router.delete(
  '/:id/images',
  authenticate,
  validate({ params: idParamSchema, body: deleteImageBodySchema }),
  deleteProductImage,
);

export default router;

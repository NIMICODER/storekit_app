// src/controllers/upload.controller.ts — Upload HTTP Controller

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadService } from '../services/upload.service';
import { sendSuccess } from '../utils/apiResponse';
import { BadRequestError } from '../errors';

// ── Upload Product Images ───────────────────────────────────────────────────

/** Upload one or more images for a product (multipart/form-data via Multer). */
export const uploadProductImages = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];

  // Multer allows empty submissions — reject manually
  if (!files || files.length === 0) {
    throw new BadRequestError('No image files provided. Use the "images" field to upload files.');
  }

  const results = await uploadService.uploadProductImages(files, req.params.id);
  sendSuccess(res, results, `${results.length} image(s) uploaded successfully`);
});

// ── Delete Product Image ────────────────────────────────────────────────────

/** Delete a product image (removes full-size + thumbnail from disk and DB). */
export const deleteProductImage = asyncHandler(async (req: Request, res: Response) => {
  const { imageUrl } = req.body;
  await uploadService.deleteProductImage(req.params.id, imageUrl);
  sendSuccess(res, { imageUrl }, 'Image deleted successfully');
});

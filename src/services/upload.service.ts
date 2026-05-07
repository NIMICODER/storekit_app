// src/services/upload.service.ts — File Upload Business Logic

import path from 'path';
import { processProductImage, deleteFile, type ProcessedImage } from '../utils/imageProcessor';
import { productRepository } from '../repositories/product.repository';
import { NotFoundError, BadRequestError } from '../errors';
import { env } from '../config/env';

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of uploading a single product image. */
export interface ImageUploadResult {
  /** Public URL for the full-size image */
  url: string;
  /** Public URL for the thumbnail */
  thumbnailUrl: string;
}

// ── Upload Service ───────────────────────────────────────────────────────────

class UploadService {
  constructor(private productRepo: typeof productRepository) {}

  /**
   * Process uploaded images and append their URLs to the product's images array.
   * @param files     - Multer file objects from req.files
   * @param productId - UUID of the target product
   * @returns Array of ImageUploadResult with public URLs
   * @throws NotFoundError if product doesn't exist
   */
  async uploadProductImages(
    files: Express.Multer.File[],
    productId: string,
  ): Promise<ImageUploadResult[]> {
    // Fail fast before spending CPU on image processing
    const product = await this.productRepo.findWithCategory(productId);
    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    // Process all images concurrently (resize, compress, WebP)
    const processedImages: ProcessedImage[] = await Promise.all(
      files.map((file) => processProductImage(file.path)),
    );

    // Convert filesystem paths to public URLs
    const results: ImageUploadResult[] = processedImages.map((processed) => ({
      url: this.buildImageUrl('products', processed.filename),
      thumbnailUrl: this.buildImageUrl('products', processed.thumbnailFilename),
    }));

    // Append new URLs to the product's existing images array
    // Only full-size URLs are stored; thumbnails are derived by convention (-thumb suffix)
    const existingImages = (product.images as string[]) || [];
    const newImageUrls = results.map((r) => r.url);
    const updatedImages = [...existingImages, ...newImageUrls];

    await this.productRepo.update(productId, { images: updatedImages });

    return results;
  }

  /**
   * Delete a specific image (full-size + thumbnail) from disk and the product record.
   * @param productId - UUID of the product
   * @param imageUrl  - Full-size image URL to remove
   * @throws NotFoundError if product doesn't exist
   * @throws BadRequestError if imageUrl isn't in the product's images array
   */
  async deleteProductImage(productId: string, imageUrl: string): Promise<void> {
    const product = await this.productRepo.findWithCategory(productId);
    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    const existingImages = (product.images as string[]) || [];
    if (!existingImages.includes(imageUrl)) {
      throw new BadRequestError(
        `Image URL '${imageUrl}' not found in product's images`,
      );
    }

    // Delete full-size and thumbnail from disk
    const fullPath = this.urlToFilePath(imageUrl);
    const parsed = path.parse(fullPath);
    const thumbnailPath = path.join(parsed.dir, `${parsed.name}-thumb${parsed.ext}`);

    await Promise.all([
      deleteFile(fullPath),
      deleteFile(thumbnailPath),
    ]);

    const updatedImages = existingImages.filter((url) => url !== imageUrl);
    await this.productRepo.update(productId, { images: updatedImages });
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /** Build a public URL from subdirectory and filename. Single source of truth for URL format. */
  private buildImageUrl(subDir: string, filename: string): string {
    return `/uploads/${subDir}/${filename}`;
  }

  /** Convert a public URL back to an absolute filesystem path (reverse of buildImageUrl). */
  private urlToFilePath(url: string): string {
    const relativePath = url.replace(/^\/uploads\//, '');
    return path.join(process.cwd(), env.uploadDir, relativePath);
  }
}

// ── Export Singleton ──────────────────────────────────────────────────────────

export const uploadService = new UploadService(productRepository);

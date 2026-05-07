// ── Image Processing with Sharp ──────────────────────────────────────────────

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

const IMAGE_CONFIG = {
  full: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 80,
  },
  thumbnail: {
    maxWidth: 300,
    maxHeight: 300,
    quality: 70,
  },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** Paths and filenames for a processed image (full-size + thumbnail). */
export interface ProcessedImage {
  filename: string;
  thumbnailFilename: string;
  fullPath: string;
  thumbnailPath: string;
}

// ── Image Processing Functions ───────────────────────────────────────────────

/**
 * Resize, compress, and convert an uploaded image to WebP.
 * Produces a full-size (1200px) and thumbnail (300px) version.
 * Deletes the original file after processing.
 * @param inputPath - Absolute path to the uploaded file
 * @returns Processed image paths and filenames
 */
export async function processProductImage(inputPath: string): Promise<ProcessedImage> {
  const parsed = path.parse(inputPath);
  const fullPath = path.join(parsed.dir, `${parsed.name}.webp`);
  const thumbnailPath = path.join(parsed.dir, `${parsed.name}-thumb.webp`);

  // ── Full-size image ──────────────────────────────────────────────────────
  await sharp(inputPath)
    .resize(IMAGE_CONFIG.full.maxWidth, IMAGE_CONFIG.full.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_CONFIG.full.quality })
    .toFile(fullPath);

  // ── Thumbnail ────────────────────────────────────────────────────────────
  await sharp(inputPath)
    .resize(IMAGE_CONFIG.thumbnail.maxWidth, IMAGE_CONFIG.thumbnail.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_CONFIG.thumbnail.quality })
    .toFile(thumbnailPath);

  // Delete original unless it was already .webp (output would overwrite it)
  if (parsed.ext.toLowerCase() !== '.webp') {
    await deleteFile(inputPath);
  }

  return {
    filename: `${parsed.name}.webp`,
    thumbnailFilename: `${parsed.name}-thumb.webp`,
    fullPath,
    thumbnailPath,
  };
}

/**
 * Delete a file from disk. Silently ignores missing files (ENOENT).
 * @param filePath - Absolute path to the file to delete
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

// src/middleware/upload.ts — Multer file upload middleware

import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { Request } from 'express';
import { env } from '../config/env';
import { BadRequestError } from '../errors';

// ── Storage Configuration ────────────────────────────────────────────────────

/**
 * Creates a Multer disk storage engine for a given subdirectory.
 * @param subDir - Subdirectory under uploads/ (e.g., 'products', 'avatars')
 * @returns Configured Multer StorageEngine
 */
function createDiskStorage(subDir: string): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb) => {
      const uploadPath = path.join(process.cwd(), env.uploadDir, subDir);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },

    // Use UUID+timestamp filenames to prevent collisions and path traversal
    filename: (_req: Request, file: Express.Multer.File, cb) => {
      const uniqueId = crypto.randomUUID();
      const timestamp = Date.now();
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uniqueId}-${timestamp}${ext}`);
    },
  });
}

// ── File Filter ──────────────────────────────────────────────────────────────

/** Rejects files whose MIME type is not in the allowed image types list. */
function imageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (env.allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `File type '${file.mimetype}' is not allowed. ` +
        `Accepted types: ${env.allowedImageTypes.join(', ')}`,
      ),
    );
  }
}

// ── Upload Middleware Factories ──────────────────────────────────────────────

/**
 * Creates middleware for uploading multiple product images.
 * @param maxCount - Maximum number of files per request (default: 5)
 * @returns Express middleware accepting files on the "images" field
 */
export function uploadProductImages(maxCount: number = 5) {
  const upload = multer({
    storage: createDiskStorage('products'),
    fileFilter: imageFileFilter,
    limits: { fileSize: env.maxFileSize },
  });

  return upload.array('images', maxCount);
}

/**
 * Creates middleware for uploading a single avatar image.
 * @returns Express middleware accepting one file on the "avatar" field
 */
export function uploadAvatar() {
  const upload = multer({
    storage: createDiskStorage('avatars'),
    fileFilter: imageFileFilter,
    limits: { fileSize: env.maxFileSize },
  });

  return upload.single('avatar');
}

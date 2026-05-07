// src/validators/upload.validator.ts — Upload Zod Schemas

import { z } from 'zod';

// ── Delete Image Body Schema ─────────────────────────────────────────────────

/** DELETE /api/v1/products/:id/images — imageUrl must start with /uploads/ to prevent path traversal. */
export const deleteImageBodySchema = z.object({
  imageUrl: z
    .string({ error: 'Image URL is required' })
    .min(1, 'Image URL cannot be empty')
    .startsWith('/uploads/', 'Image URL must start with /uploads/'),
});

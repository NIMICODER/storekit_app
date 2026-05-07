// src/validators/category.validator.ts — Category Zod Schemas

import { z } from 'zod';
import { paginationSchema } from './common.validator';

// ── Create Category Schema ───────────────────────────────────────────────────

/** POST /api/v1/categories — required: name, slug; optional: description, image, parentId. */
export const createCategorySchema = z.object({
  name: z
    .string({ error: 'Category name is required' })
    .min(1, 'Category name cannot be empty')
    .max(200, 'Category name cannot exceed 200 characters'),

  slug: z
    .string({ error: 'Category slug is required' })
    .min(1, 'Category slug cannot be empty')
    .max(200, 'Category slug cannot exceed 200 characters'),

  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional()
    .nullable(),

  image: z
    .string()
    .max(500, 'Image URL cannot exceed 500 characters')
    .optional()
    .nullable(),

  // Service layer verifies the parent category exists
  parentId: z
    .string()
    .uuid('Parent ID must be a valid UUID')
    .optional()
    .nullable(),
});

// ── Update Category Schema ───────────────────────────────────────────────────

/** PUT /api/v1/categories/:id — all fields optional for partial updates. */
export const updateCategorySchema = createCategorySchema.partial();

// ── Get Category Products Query ──────────────────────────────────────────────

/** GET /api/v1/categories/:id/products — pagination only. */
export const getCategoryProductsQuerySchema = paginationSchema;

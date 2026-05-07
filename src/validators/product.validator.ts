// src/validators/product.validator.ts — Product Zod Schemas

import { z } from 'zod';
import { paginationSchema, sortSchema, cursorSchema } from './common.validator';

// ── Create Product Schema ────────────────────────────────────────────────────

/** POST /api/v1/products — required: name, price, stock; optional: slug (auto-generated), sku, categoryId, etc. */
export const createProductSchema = z.object({
  name: z
    .string({ error: 'Product name is required' })
    .min(1, 'Product name cannot be empty')
    .max(200, 'Product name cannot exceed 200 characters'),

  // Optional — auto-generated from name if omitted
  slug: z
    .string()
    .min(1, 'Product slug cannot be empty')
    .max(200, 'Product slug cannot exceed 200 characters')
    .optional(),

  price: z
    .number({ error: 'Price is required and must be a number' })
    .positive('Price must be greater than 0'),

  stock: z
    .number({ error: 'Stock is required and must be a number' })
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),

  sku: z
    .string()
    .min(1, 'SKU cannot be empty')
    .max(100, 'SKU cannot exceed 100 characters')
    .optional(),

  categoryId: z
    .string()
    .uuid('Category ID must be a valid UUID')
    .optional()
    .nullable(),

  description: z
    .string()
    .max(5000, 'Description cannot exceed 5000 characters')
    .optional()
    .nullable(),

  // Stored as JSON (typically an array of URLs)
  images: z.any().optional(),

  isActive: z
    .boolean()
    .default(true),
});

// ── Update Product Schema ────────────────────────────────────────────────────

/** PUT /api/v1/products/:id — all fields optional for partial updates. */
export const updateProductSchema = createProductSchema.partial();

// ── Get Products Query Schema ────────────────────────────────────────────────

/** GET /api/v1/products — pagination + category/price/search filters + sort + cursor. */
export const getProductsQuerySchema = paginationSchema.merge(
  z.object({
    categoryId: z
      .string()
      .uuid('Category ID must be a valid UUID')
      .optional(),

    minPrice: z.coerce
      .number()
      .min(0, 'Minimum price cannot be negative')
      .optional(),

    maxPrice: z.coerce
      .number()
      .min(0, 'Maximum price cannot be negative')
      .optional(),

    search: z
      .string()
      .max(200, 'Search query cannot exceed 200 characters')
      .optional(),

    sort: sortSchema,

    cursor: cursorSchema,
  }),
);

// ── Patch Product Schema ─────────────────────────────────────────────────────

/** PATCH /api/v1/products/:id — requires at least one field (unlike PUT which allows empty). */
export const patchProductSchema = createProductSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'PATCH requires at least one field to update' },
  );

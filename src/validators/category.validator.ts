/**
 * src/validators/category.validator.ts — Category Zod Schemas
 *
 * PURPOSE:
 *   Defines Zod schemas for category-related requests:
 *     - createCategorySchema         → POST /categories body
 *     - updateCategorySchema         → PUT /categories/:id body
 *     - getCategoryProductsQuerySchema → GET /categories/:id/products query
 *
 * C# EQUIVALENT:
 *   public class CreateCategoryDto {
 *     [Required] public string Name { get; set; }
 *     [Required] public string Slug { get; set; }
 *     public string? Description { get; set; }
 *     public string? Image { get; set; }
 *     public Guid? ParentId { get; set; }
 *   }
 */

import { z } from 'zod';
import { paginationSchema } from './common.validator';

// ─────────────────────────────────────────────────────────────────────────────
// Create Category Schema — POST /api/v1/categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the request body for creating a new category.
 *
 * Required: name, slug
 * Optional: description, image, parentId
 *
 * Categories can be nested (parentId references another category):
 *   Electronics (root)
 *     ├── Phones (parentId → Electronics)
 *     └── Laptops (parentId → Electronics)
 */
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

  // Image URL for category thumbnail/banner.
  image: z
    .string()
    .max(500, 'Image URL cannot exceed 500 characters')
    .optional()
    .nullable(),

  // Parent category — if provided, must be a valid UUID.
  // The service layer will verify this category actually exists.
  parentId: z
    .string()
    .uuid('Parent ID must be a valid UUID')
    .optional()
    .nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Update Category Schema — PUT /api/v1/categories/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All fields optional for partial updates.
 * .partial() converts every required field to optional.
 */
export const updateCategorySchema = createCategorySchema.partial();

// ─────────────────────────────────────────────────────────────────────────────
// Get Category Products Query — GET /api/v1/categories/:id/products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates pagination query params for the category products endpoint.
 * Just page + limit — no additional filters needed here.
 */
export const getCategoryProductsQuerySchema = paginationSchema;

/**
 * src/validators/product.validator.ts — Product Zod Schemas
 *
 * PURPOSE:
 *   Defines Zod schemas for product-related requests:
 *     - createProductSchema  → POST /products body
 *     - updateProductSchema  → PUT /products/:id body
 *     - getProductsQuerySchema → GET /products query params
 *
 * EACH SCHEMA VALIDATES:
 *   1. Required vs optional fields
 *   2. Data types (string, number, boolean, uuid)
 *   3. Constraints (min, max, positive, etc.)
 *   4. Defaults for optional fields
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   public class CreateProductDto {
 *     [Required]
 *     [StringLength(200)]
 *     public string Name { get; set; }
 *
 *     [Required]
 *     public string Slug { get; set; }
 *
 *     [Range(0.01, double.MaxValue)]
 *     public decimal Price { get; set; }
 *
 *     [Range(0, int.MaxValue)]
 *     public int Stock { get; set; }
 *   }
 *
 *   // Or with FluentValidation:
 *   public class CreateProductValidator : AbstractValidator<CreateProductDto> {
 *     public CreateProductValidator() {
 *       RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
 *       RuleFor(x => x.Slug).NotEmpty();
 *       RuleFor(x => x.Price).GreaterThan(0);
 *       RuleFor(x => x.Stock).GreaterThanOrEqualTo(0);
 *     }
 *   }
 *
 * ZOD v4 NOTE:
 * ───────────────────────────────────────────────────────────────────────────
 *   Zod v4 uses `error:` instead of `required_error:` for custom error messages.
 *   The `error` property works for ALL error types (required, invalid type, etc.).
 */

import { z } from 'zod';
import { paginationSchema, sortSchema, cursorSchema } from './common.validator';

// ─────────────────────────────────────────────────────────────────────────────
// Create Product Schema — POST /api/v1/products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the request body for creating a new product.
 *
 * Required fields: name, slug, price, stock
 * Optional fields: sku, categoryId, description, images, isActive
 *
 * This schema ensures:
 *   - name is a non-empty string (max 200 chars)
 *   - slug is a non-empty string (URL-friendly identifier)
 *   - price is a positive number (no free or negative-priced products!)
 *   - stock is a non-negative integer (can be 0 = out of stock)
 *   - categoryId, if provided, must be a valid UUID
 *   - images, if provided, must be a JSON-compatible value (array, object, etc.)
 *   - isActive defaults to true if not provided
 */
export const createProductSchema = z.object({
  name: z
    .string({ error: 'Product name is required' })
    .min(1, 'Product name cannot be empty')
    .max(200, 'Product name cannot exceed 200 characters'),

  // Slug is now OPTIONAL — if not provided, it's auto-generated from the name.
  // Phase 7 added auto-slug generation in the service layer.
  // If the client wants a specific slug, they can still provide one.
  slug: z
    .string()
    .min(1, 'Product slug cannot be empty')
    .max(200, 'Product slug cannot exceed 200 characters')
    .optional(),

  // Price must be a positive number.
  // We use .positive() instead of .min(0) because free products (price: 0) aren't allowed.
  //
  // z.number() requires the value to already BE a number (not a string).
  // Since req.body comes from express.json(), it's already parsed from JSON,
  // so numeric values are real numbers (unlike query strings which are always strings).
  price: z
    .number({ error: 'Price is required and must be a number' })
    .positive('Price must be greater than 0'),

  // Stock must be a non-negative integer.
  // .int() ensures no fractional stock (you can't have 2.5 items in stock).
  // .min(0) allows zero (out of stock) but not negative.
  stock: z
    .number({ error: 'Stock is required and must be a number' })
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),

  // SKU (Stock Keeping Unit) — optional unique identifier.
  // If provided, must be a non-empty string.
  sku: z
    .string()
    .min(1, 'SKU cannot be empty')
    .max(100, 'SKU cannot exceed 100 characters')
    .optional(),

  // Category — optional. If linking to a category, must be a valid UUID.
  categoryId: z
    .string()
    .uuid('Category ID must be a valid UUID')
    .optional()
    .nullable(),

  // Description — free-text, optional.
  description: z
    .string()
    .max(5000, 'Description cannot exceed 5000 characters')
    .optional()
    .nullable(),

  // Images — stored as JSON in the database.
  // We accept any JSON-compatible value (typically an array of URLs).
  // More specific image validation would be added if we had a defined schema for images.
  images: z.any().optional(),

  // isActive — defaults to true for new products.
  // A deactivated product won't appear in storefront listings.
  isActive: z
    .boolean()
    .default(true),
});

// ─────────────────────────────────────────────────────────────────────────────
// Update Product Schema — PUT /api/v1/products/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the request body for updating a product.
 *
 * ALL fields are optional (partial update).
 * Only the fields included in the request body will be updated.
 *
 * .partial() makes every field optional — it's like:
 *   name?: string | undefined
 *   price?: number | undefined
 *   etc.
 *
 * C# equivalent: a separate UpdateProductDto with all nullable properties,
 * or using JSON Patch / AutoMapper to apply partial updates.
 */
export const updateProductSchema = createProductSchema.partial();

// ─────────────────────────────────────────────────────────────────────────────
// Get Products Query Schema — GET /api/v1/products?page=1&limit=10&...
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates query parameters for the product list endpoint.
 *
 * Extends the common pagination schema with product-specific filters:
 *   ?page=1&limit=10             → pagination (from common)
 *   ?categoryId=uuid             → filter by category
 *   ?minPrice=10&maxPrice=100    → price range filter
 *   ?search=phone                → text search in name/description
 *
 * .merge() combines two Zod objects into one.
 * It's like spread for schemas: { ...paginationSchema, ...productFilters }
 *
 * z.coerce.number() is used for minPrice/maxPrice because query params
 * are always strings ("100" → 100).
 */
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

    // Phase 7: Dynamic sorting.
    // Format: "field:direction" — e.g., "price:asc" or "price:asc,name:desc"
    // The sortSchema validates the format; the repository validates field names.
    sort: sortSchema,

    // Phase 7: Cursor-based pagination.
    // If provided, overrides offset pagination (page/limit still used for limit).
    // The cursor is the ID of the last item from the previous page.
    cursor: cursorSchema,
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Patch Product Schema — PATCH /api/v1/products/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the request body for patching (partial updating) a product.
 *
 * PATCH vs PUT:
 * ───────────────────────────────────────────────────────────────────────────
 *   PUT  = "replace the entire resource" (all fields optional because Prisma
 *          does partial updates, but semantically it's a full replacement)
 *   PATCH = "update specific fields" — requires at LEAST one field
 *
 *   The key difference: PATCH with an empty body {} is a 400 error.
 *   PUT with an empty body {} is technically valid (no-op update).
 *
 *   We use Zod's .refine() to enforce "at least 1 field" — there's no built-in
 *   Zod method for "non-empty object". Refine is Zod's escape hatch for
 *   custom validation logic.
 *
 * C# equivalent:
 *   [HttpPatch("{id}")]
 *   public IActionResult Patch(Guid id, [FromBody] JsonPatchDocument<ProductDto> patch) {
 *     if (patch.Operations.Count == 0) return BadRequest("No operations");
 *     // ...
 *   }
 *
 * NOTE: C# typically uses JSON Patch (RFC 6902) for PATCH endpoints, which is
 * a more formal spec. Our approach is simpler — just send the fields to update
 * as a normal JSON object. This is sometimes called a "merge patch" (RFC 7386).
 */
export const patchProductSchema = createProductSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'PATCH requires at least one field to update' },
  );

/**
 * src/validators/common.validator.ts — Shared Zod Schemas
 *
 * PURPOSE:
 *   Contains reusable Zod schemas used across multiple validators:
 *     - idParamSchema:    validates UUID in URL params (/:id)
 *     - slugParamSchema:  validates slug in URL params (/:slug)
 *     - paginationSchema: validates page/limit in query strings
 *
 * WHY SHARED SCHEMAS?
 * ───────────────────────────────────────────────────────────────────────────
 *   Many routes need the same validation:
 *     GET  /products/:id     → needs UUID validation
 *     GET  /categories/:id   → needs UUID validation (same rule!)
 *     PUT  /users/:id        → needs UUID validation (same rule!)
 *
 *   Instead of duplicating the schema, we define it once here and import it.
 *   DRY principle — Don't Repeat Yourself.
 *
 * ZOD BASICS:
 * ───────────────────────────────────────────────────────────────────────────
 *   Zod is a TypeScript-first schema validation library.
 *   You define a schema, then parse data against it:
 *
 *     const schema = z.object({ name: z.string().min(1) });
 *     const result = schema.safeParse(req.body);
 *     // result.success → true/false
 *     // result.data    → parsed + typed data (if success)
 *     // result.error   → ZodError with detailed issues (if failure)
 *
 *   Key Zod methods used in this file:
 *     z.string()         → must be a string
 *     z.string().uuid()  → must be a valid UUID format
 *     z.string().min(1)  → must be at least 1 character
 *     z.coerce.number()  → convert string to number (useful for query params)
 *     .int()             → must be an integer (no decimals)
 *     .min(1)            → minimum value of 1
 *     .max(100)          → maximum value of 100
 *     .default(10)       → use 10 if the value is undefined
 *     z.object({...})    → object with specific fields
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   Zod is similar to FluentValidation:
 *
 *     // FluentValidation
 *     RuleFor(x => x.Id).NotEmpty().Must(BeAValidGuid);
 *     RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
 *     RuleFor(x => x.Limit).InclusiveBetween(1, 100);
 *
 *     // Or Data Annotations
 *     [Required]
 *     [RegularExpression(@"^[a-f0-9-]{36}$")]
 *     public Guid Id { get; set; }
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// URL Parameter Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the `id` URL parameter is a valid UUID.
 *
 * Applied to routes like:
 *   GET    /products/:id
 *   PUT    /products/:id
 *   DELETE /products/:id
 *
 * Without this, a request to /products/not-a-uuid would pass through
 * to the database layer, which would throw a cryptic Prisma error.
 * With this, the client gets a clean 400 response:
 *   { field: 'params.id', message: 'Invalid uuid' }
 *
 * UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * Example:     550e8400-e29b-41d4-a716-446655440000
 */
export const idParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format for id parameter'),
});

/**
 * Validates that the `slug` URL parameter is a non-empty string.
 *
 * Applied to routes like:
 *   GET /products/slug/:slug
 *   GET /categories/slug/:slug
 *
 * Slugs are URL-friendly identifiers: "wireless-headphones", "electronics"
 * We just need to ensure it's not empty — slug format is more of a
 * business concern (handled at creation time, not lookup time).
 */
export const slugParamSchema = z.object({
  slug: z.string().min(1, 'Slug parameter is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Query String Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates and transforms pagination query parameters.
 *
 * Applied to routes like:
 *   GET /products?page=2&limit=20
 *   GET /users?page=1&limit=50
 *
 * WHY z.coerce.number()?
 * ──────────────────────────────────────────────────────────────────────────
 *   ALL query string values arrive as STRINGS in Express:
 *     req.query.page = "2"  (string, not number!)
 *
 *   z.coerce.number() converts the string to a number:
 *     "2" → 2, "abc" → NaN (fails validation)
 *
 *   In C#, [FromQuery] auto-converts:
 *     public IActionResult Get([FromQuery] int page = 1)
 *     // ASP.NET converts "2" to int 2 automatically
 *
 *   In Express + Zod, z.coerce gives us the same auto-conversion.
 *
 * WHY .default()?
 * ──────────────────────────────────────────────────────────────────────────
 *   If the client doesn't send ?page= at all, the value is undefined.
 *   .default(1) says: "if undefined, use 1."
 *
 *   After parsing: req.query.page is ALWAYS a number (never undefined, never a string).
 *   This eliminates the `parseInt(req.query.page as string, 10) || 1` pattern
 *   that was in every controller before.
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int('Page must be a whole number')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.coerce
    .number()
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(10),
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort & Cursor Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the `sort` query parameter format: "field:direction,field:direction"
 *
 * Examples:
 *   ?sort=price:asc             → single sort
 *   ?sort=price:asc,name:desc   → multi-sort
 *
 * This only validates the FORMAT (looks like "word:asc" or "word:desc").
 * The actual field names are validated at the repository level against
 * a whitelist — the schema can't know which fields a model has.
 *
 * WHY REGEX?
 * ──────────────────────────────────────────────────────────────────────────
 *   We need to check that the string matches the "field:direction" pattern
 *   before it reaches the sort parser. Without this, garbage like "!!!" or
 *   "SELECT * FROM users" would pass validation and reach the query builder.
 *
 *   Regex breakdown: ^[a-zA-Z]+:(asc|desc)(,[a-zA-Z]+:(asc|desc))*$
 *     ^                       → start of string
 *     [a-zA-Z]+               → one or more letters (the field name)
 *     :(asc|desc)             → colon followed by "asc" or "desc"
 *     (,...)*                  → optionally repeat with comma separator
 *     $                       → end of string
 *
 * C# equivalent:
 *   [RegularExpression(@"^[a-zA-Z]+:(asc|desc)(,[a-zA-Z]+:(asc|desc))*$")]
 *   public string? Sort { get; set; }
 */
export const sortSchema = z
  .string()
  .regex(
    /^[a-zA-Z]+:(asc|desc)(,[a-zA-Z]+:(asc|desc))*$/,
    'Sort must be in format "field:asc" or "field:desc", comma-separated for multiple sorts',
  )
  .optional();

/**
 * Validates the `cursor` query parameter — must be a valid UUID.
 *
 * The cursor is the ID of the last item the client received.
 * Since all our IDs are UUIDs, the cursor must also be a UUID.
 *
 * C# equivalent:
 *   [FromQuery] public Guid? Cursor { get; set; }
 */
export const cursorSchema = z
  .string()
  .uuid('Cursor must be a valid UUID')
  .optional();

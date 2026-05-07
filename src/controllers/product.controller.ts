/**
 * src/controllers/product.controller.ts — Product HTTP Controller
 *
 * PURPOSE:
 *   Handles HTTP requests for product endpoints.
 *   Controllers are THIN — they only do three things:
 *     1. READ the parsed request data (validated by middleware)
 *     2. CALL the service layer (where business logic lives)
 *     3. SEND the HTTP response (using our standardized helpers)
 *
 *   No business logic here! That's the service's job.
 *   No try/catch here! asyncHandler + global errorHandler handle errors.
 *   No input parsing here! Zod validate() middleware handles validation.
 *
 * PHASE 7 CHANGES:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. getProducts() now handles `sort` and `cursor` query params
 *   2. When cursor pagination is used, response meta uses CursorPaginationMeta
 *   3. New patchProduct() handler for PATCH /products/:id
 *   4. DELETE now returns 200 with a message (soft delete — record still exists)
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   [ApiController]
 *   [Route("api/v1/products")]
 *   public class ProductController : ControllerBase {
 *     [HttpGet]
 *     public async Task<IActionResult> GetProducts([FromQuery] ProductFilter filter)
 *     [HttpGet("{id}")]
 *     public async Task<IActionResult> GetById(Guid id)
 *     [HttpPost]
 *     public async Task<IActionResult> Create([FromBody] CreateProductDto dto)
 *     [HttpPut("{id}")]
 *     public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProductDto dto)
 *     [HttpPatch("{id}")]
 *     public async Task<IActionResult> Patch(Guid id, [FromBody] PatchProductDto dto)
 *     [HttpDelete("{id}")]
 *     public async Task<IActionResult> Delete(Guid id)
 *   }
 */

import { Request, Response } from 'express';
import { productService } from '../services/product.service';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendCursorPaginated,
  buildPaginationMeta,
  buildCursorPaginationMeta,
} from '../utils/apiResponse';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a paginated list of products with optional filters, sorting, and cursor.
 *
 * Query parameters (all validated + coerced by Zod):
 *   ?page=1              - Page number (default: 1)        ← offset pagination
 *   ?limit=10            - Items per page (default: 10)
 *   ?categoryId=xxx      - Filter by category              ← Zod validates UUID
 *   ?minPrice=10         - Minimum price                   ← Zod coerces string → number
 *   ?maxPrice=100        - Maximum price
 *   ?search=phone        - Search in name/description
 *   ?sort=price:asc      - Sort by field (Phase 7)         ← new!
 *   ?cursor=uuid         - Cursor pagination (Phase 7)     ← new!
 *
 * PAGINATION MODES:
 * ────────────────────────────────────────────────────────────────────────
 *   If `cursor` is provided → cursor-based pagination (returns nextCursor)
 *   Otherwise → offset-based pagination (returns page, totalPages, etc.)
 *
 *   The client chooses which mode by including/excluding the cursor param.
 *   Both modes respect the same filters and sorting.
 */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  // req.query has been validated and transformed by Zod.
  // Cast through unknown because Zod replaced the raw ParsedQs with typed values.
  const { page, limit, categoryId, minPrice, maxPrice, search, sort, cursor } =
    req.query as unknown as {
      page: number;
      limit: number;
      categoryId?: string;
      minPrice?: number;
      maxPrice?: number;
      search?: string;
      sort?: string;
      cursor?: string;
    };

  const { products, total } = await productService.getProducts({
    page,
    limit,
    categoryId,
    minPrice,
    maxPrice,
    search,
    sort,
    cursor,
  });

  // Choose the response format based on which pagination mode was used.
  //
  // Cursor mode: meta = { limit, nextCursor, hasMore }
  //   → Client uses nextCursor to fetch the next page
  //
  // Offset mode: meta = { total, page, limit, totalPages, hasNextPage, hasPrevPage }
  //   → Client uses page number to navigate
  if (cursor) {
    const meta = buildCursorPaginationMeta(products, limit);
    sendCursorPaginated(res, products, meta);
  } else {
    const meta = buildPaginationMeta(total, page, limit);
    sendPaginated(res, products, meta);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/products/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single product by its UUID.
 *
 * req.params.id is validated as a UUID by the idParamSchema.
 * If the UUID is valid but no product exists (or it's soft-deleted),
 * the service throws NotFoundError → 404.
 */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductById(req.params.id);
  sendSuccess(res, product);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/products/slug/:slug
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a product by its URL-friendly slug.
 *
 * Example: GET /api/v1/products/slug/wireless-headphones
 */
export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductBySlug(req.params.slug);
  sendSuccess(res, product);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new product.
 *
 * Phase 7: slug is now optional in the request body.
 * If not provided, the service auto-generates it from the product name.
 *
 *   POST /products { "name": "Wireless Headphones", "price": 49.99, "stock": 100 }
 *   → slug auto-generated as "wireless-headphones"
 *
 *   POST /products { "name": "Wireless Headphones", "slug": "my-custom-slug", ... }
 *   → uses "my-custom-slug" as-is
 */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.createProduct(req.body);
  sendCreated(res, product, 'Product created successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/products/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update an existing product (full replacement semantics).
 *
 * Both params (validated UUID) and body (validated partial product) are
 * pre-validated by middleware.
 */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, product, 'Product updated successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/products/:id  (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Partially update a product — requires at least one field.
 *
 * PATCH vs PUT:
 * ────────────────────────────────────────────────────────────────────────
 *   PUT  = replace the resource (empty body = valid no-op)
 *   PATCH = modify specific fields (empty body = 400 error)
 *
 *   In practice, both call the same service method (updateProduct).
 *   The difference is semantic + validation:
 *     - PUT uses updateProductSchema (all fields optional, empty OK)
 *     - PATCH uses patchProductSchema (all fields optional, but ≥1 required)
 *
 *   This matters for API consumers who follow REST conventions strictly.
 *   Many frontend frameworks default to PATCH for partial updates.
 *
 * C# equivalent:
 *   [HttpPatch("{id}")]
 *   public async Task<IActionResult> Patch(
 *     Guid id,
 *     [FromBody] JsonPatchDocument<ProductDto> patchDoc
 *   ) { ... }
 *
 * @example
 *   PATCH /products/abc { "price": 29.99 }
 *   → Only price is updated, everything else stays the same
 *
 *   PATCH /products/abc {}
 *   → 400 VALIDATION_ERROR: "PATCH requires at least one field to update"
 */
export const patchProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, product, 'Product updated successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/products/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-delete a product by ID.
 *
 * Phase 7 CHANGE: This now performs a SOFT delete.
 *
 * Before (Phase 4-6):
 *   DELETE /products/:id → permanently removes the row → 204 No Content
 *
 * After (Phase 7):
 *   DELETE /products/:id → sets deletedAt = now() → 200 OK with message
 *
 * WHY 200 instead of 204?
 * ────────────────────────────────────────────────────────────────────────
 *   204 No Content = "the resource is gone, nothing to say"
 *   200 OK with message = "the resource was soft-deleted, here's confirmation"
 *
 *   Since the product still exists in the DB (just hidden), 200 with a
 *   message is more informative. The client knows the action succeeded
 *   and that it was a soft delete (not a permanent removal).
 */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id);
  sendSuccess(res, { id: req.params.id }, 'Product soft-deleted successfully');
});

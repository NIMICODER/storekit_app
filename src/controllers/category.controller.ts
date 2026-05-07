/**
 * src/controllers/category.controller.ts — Category HTTP Controller
 *
 * PURPOSE:
 *   Handles HTTP requests for category endpoints.
 *   Same THIN controller pattern as product.controller.ts:
 *     1. Read validated request data
 *     2. Call service
 *     3. Send response
 *
 * PHASE 5 CHANGES:
 *   - All handlers wrapped with asyncHandler (no try/catch)
 *   - Zod validate() middleware handles input parsing + validation
 *   - Services throw custom errors → global errorHandler formats responses
 *
 * SPECIAL FEATURE: TREE MODE
 * ───────────────────────────────────────────────────────────────────────────
 *   GET /api/v1/categories         → flat list of all categories
 *   GET /api/v1/categories?tree=true → nested tree structure
 *
 * C# EQUIVALENT:
 *   [ApiController]
 *   [Route("api/v1/categories")]
 *   public class CategoryController : ControllerBase { ... }
 */

import { Request, Response } from 'express';
import { categoryService } from '../services/category.service';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
  buildPaginationMeta,
} from '../utils/apiResponse';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all categories.
 *
 * Supports two modes via query parameter:
 *   ?tree=true  → nested tree (root → children → grandchildren)
 *   (default)   → flat list of all categories
 *
 * The tree mode is perfect for rendering navigation menus.
 * The flat mode is useful for admin dropdowns (e.g., "select a category").
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  // Check if the client wants a tree structure
  const wantTree = req.query.tree === 'true';

  const categories = wantTree
    ? await categoryService.getCategoryTree()
    : await categoryService.getCategories();

  sendSuccess(res, categories);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/categories/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single category by ID.
 *
 * Returns the category with its parent and children.
 */
export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryById(req.params.id);
  sendSuccess(res, category);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/categories/slug/:slug
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a category by its URL slug.
 *
 * Same route-ordering consideration as products:
 * /slug/:slug MUST come before /:id in the route definitions.
 */
export const getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);
  sendSuccess(res, category);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/categories/:id/products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a category's active products (paginated).
 *
 * This is a NESTED RESOURCE endpoint:
 *   /categories/:id/products = "products belonging to category :id"
 *
 * Query params (page, limit) are validated and coerced by Zod.
 */
export const getCategoryProducts = asyncHandler(async (req: Request, res: Response) => {
  // Zod has already parsed and coerced page/limit from strings to numbers
  // Cast through unknown — Zod replaced ParsedQs with typed values
  const { page, limit } = req.query as unknown as { page: number; limit: number };

  const { products, total } = await categoryService.getCategoryWithProducts(
    req.params.id,
    page,
    limit,
  );

  const meta = buildPaginationMeta(total, page, limit);
  sendPaginated(res, products, meta);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new category.
 *
 * req.body validated by createCategorySchema:
 *   - name, slug are required and non-empty
 *   - description, image, parentId are optional
 *   - parentId, if provided, must be a valid UUID
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.createCategory(req.body);
  sendCreated(res, category, 'Category created successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/categories/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update an existing category.
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  sendSuccess(res, category, 'Category updated successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/categories/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete a category.
 *
 * Products in this category will have their categoryId set to NULL
 * (not deleted — the onDelete: SetNull rule in the schema).
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  await categoryService.deleteCategory(req.params.id);
  sendNoContent(res);
});

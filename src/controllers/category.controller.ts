// src/controllers/category.controller.ts — Category HTTP Controller

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

// ── Get Categories ──────────────────────────────────────────────────────────

/** List all categories. Use `?tree=true` for nested tree structure. */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const wantTree = req.query.tree === 'true';

  const categories = wantTree
    ? await categoryService.getCategoryTree()
    : await categoryService.getCategories();

  sendSuccess(res, categories);
});

// ── Get Category By ID ──────────────────────────────────────────────────────

/** Get a single category by ID (includes parent and children). */
export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryById(req.params.id);
  sendSuccess(res, category);
});

// ── Get Category By Slug ────────────────────────────────────────────────────

/** Get a category by its URL slug. */
export const getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);
  sendSuccess(res, category);
});

// ── Get Category Products ───────────────────────────────────────────────────

/** Get paginated products belonging to a category. */
export const getCategoryProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };

  const { products, total } = await categoryService.getCategoryWithProducts(
    req.params.id,
    page,
    limit,
  );

  const meta = buildPaginationMeta(total, page, limit);
  sendPaginated(res, products, meta);
});

// ── Create Category ─────────────────────────────────────────────────────────

/** Create a new category. */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.createCategory(req.body);
  sendCreated(res, category, 'Category created successfully');
});

// ── Update Category ─────────────────────────────────────────────────────────

/** Update an existing category. */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  sendSuccess(res, category, 'Category updated successfully');
});

// ── Delete Category ─────────────────────────────────────────────────────────

/** Delete a category. Products in it get their categoryId set to NULL. */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  await categoryService.deleteCategory(req.params.id);
  sendNoContent(res);
});

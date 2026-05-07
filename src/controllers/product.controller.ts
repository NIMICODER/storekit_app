// src/controllers/product.controller.ts — Product HTTP Controller

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

// ── Get Products ────────────────────────────────────────────────────────────

/** Get paginated products with optional filters, sorting, and cursor pagination. */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
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

  // Cursor param present → cursor-based response; otherwise → offset-based
  if (cursor) {
    const meta = buildCursorPaginationMeta(products, limit);
    sendCursorPaginated(res, products, meta);
  } else {
    const meta = buildPaginationMeta(total, page, limit);
    sendPaginated(res, products, meta);
  }
});

// ── Get Product By ID ───────────────────────────────────────────────────────

/** Get a single product by UUID. */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductById(req.params.id);
  sendSuccess(res, product);
});

// ── Get Product By Slug ─────────────────────────────────────────────────────

/** Get a product by its URL-friendly slug. */
export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductBySlug(req.params.slug);
  sendSuccess(res, product);
});

// ── Create Product ──────────────────────────────────────────────────────────

/** Create a new product. Slug is auto-generated from name if not provided. */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.createProduct(req.body);
  sendCreated(res, product, 'Product created successfully');
});

// ── Update Product (PUT) ────────────────────────────────────────────────────

/** Full update of an existing product. */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, product, 'Product updated successfully');
});

// ── Patch Product (PATCH) ───────────────────────────────────────────────────

/** Partial update — requires at least one field (empty body returns 400). */
export const patchProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, product, 'Product updated successfully');
});

// ── Delete Product ──────────────────────────────────────────────────────────

/** Soft-delete a product (sets deletedAt, returns 200 with confirmation). */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id);
  sendSuccess(res, { id: req.params.id }, 'Product soft-deleted successfully');
});

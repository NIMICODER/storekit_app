// ── Product Repository ──────────────────────────────────────────────────────
// Data access for the Product model. All reads filter out soft-deleted records
// (deletedAt: null) unless explicitly stated otherwise.

import { BaseRepository } from './base.repository';
import prisma from '../config/database';
import { parseSortParam, buildCursorArgs } from '../utils/queryBuilder';
import type { OrderByEntry } from '../utils/queryBuilder';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Whitelist of fields clients can sort by — prevents sorting on sensitive/internal fields. */
const ALLOWED_SORT_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'];

// ── Types ─────────────────────────────────────────────────────────────────────

/** Query parameters for the main product listing endpoint. */
export interface FindActiveProductsParams {
  page: number;
  limit: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /** Sort string, e.g. "price:asc,name:desc" */
  sort?: string;
  /** Cursor ID for cursor-based pagination */
  cursor?: string;
}

// ── Product Repository Class ──────────────────────────────────────────────────

class ProductRepository extends BaseRepository {
  constructor() {
    super(prisma.product);
  }

  // ── Read Methods ────────────────────────────────────────────────────────

  /** Find by slug with category included. Excludes soft-deleted. */
  async findBySlug(slug: string) {
    return prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: { category: true },
    });
  }

  /** Find by SKU. Excludes soft-deleted. */
  async findBySku(sku: string) {
    return prisma.product.findFirst({
      where: { sku, deletedAt: null },
    });
  }

  /** Find by ID with category eagerly loaded. Excludes soft-deleted. */
  async findWithCategory(id: string) {
    return prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
  }

  /**
   * Main product listing — supports pagination (offset or cursor), filtering,
   * sorting, and text search.
   * @returns { products, total }
   */
  async findActiveProducts(params: FindActiveProductsParams) {
    const { page, limit, categoryId, minPrice, maxPrice, search, sort, cursor } = params;

    // ── Build WHERE clause ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
      deletedAt: null,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ── Build ORDER BY ────────────────────────────────────────────────
    const orderBy: OrderByEntry[] = sort
      ? parseSortParam(sort, ALLOWED_SORT_FIELDS) ?? [{ createdAt: 'desc' }]
      : [{ createdAt: 'desc' }];

    // ── Cursor pagination ─────────────────────────────────────────────
    if (cursor) {
      const cursorArgs = buildCursorArgs(cursor, limit);
      const products = await prisma.product.findMany({
        where,
        include: { category: true },
        orderBy,
        ...cursorArgs,
      });

      const total = await prisma.product.count({ where });
      return { products, total };
    }

    // ── Offset pagination (default) ───────────────────────────────────
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  }

  // ── Write Methods ───────────────────────────────────────────────────────

  /** Update stock quantity. Separated for future business logic (low-stock alerts, events). */
  async updateStock(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: { stock: quantity },
    });
  }

  /** Soft-delete by setting deletedAt timestamp. Preserves referential integrity and audit trail. */
  async softDelete(id: string) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Find by slug INCLUDING soft-deleted — used for slug uniqueness checks. */
  async findBySlugIncludeDeleted(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
    });
  }
}

// ── Export Singleton ───────────────────────────────────────────────────────────

export const productRepository = new ProductRepository();

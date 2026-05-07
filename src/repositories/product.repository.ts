/**
 * src/repositories/product.repository.ts — Product Data Access Layer
 *
 * PURPOSE:
 *   Handles ALL database interactions for the Product model.
 *   Extends BaseRepository with product-specific query methods.
 *
 * WHY EXTEND BaseRepository?
 * ───────────────────────────────────────────────────────────────────────────
 *   BaseRepository gives us findAll, findById, create, update, delete, count
 *   for FREE. This file only adds PRODUCT-SPECIFIC operations:
 *     - findBySlug()         → SEO-friendly URL lookup
 *     - findBySku()          → inventory system lookup
 *     - findWithCategory()   → product + its category (eager load)
 *     - findActiveProducts() → paginated, filtered, sorted product listing
 *     - updateStock()        → inventory management
 *     - softDelete()         → mark product as deleted without removing from DB
 *
 * PHASE 7 CHANGES:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. All read methods now filter `deletedAt: null` (soft delete support)
 *   2. findActiveProducts() accepts `sort` and `cursor` params
 *   3. New softDelete() method — sets deletedAt instead of removing the row
 *   4. Dynamic sorting via parseSortParam() utility
 *   5. Cursor-based pagination as an alternative to offset pagination
 *
 * C# EQUIVALENT:
 *   public class ProductRepository : GenericRepository<Product>, IProductRepository {
 *     // With a global query filter for soft delete:
 *     // modelBuilder.Entity<Product>().HasQueryFilter(p => p.DeletedAt == null);
 *   }
 *
 * SINGLETON PATTERN:
 * ───────────────────────────────────────────────────────────────────────────
 *   We export a single instance (productRepository) instead of a class.
 *   This is the Node.js equivalent of registering a service as a singleton
 *   in .NET's DI container:
 *     services.AddSingleton<IProductRepository, ProductRepository>();
 */

import { BaseRepository } from './base.repository';
import prisma from '../config/database';
import { parseSortParam, buildCursorArgs } from '../utils/queryBuilder';
import type { OrderByEntry } from '../utils/queryBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whitelist of product fields that clients can sort by.
 *
 * WHY A WHITELIST?
 * ────────────────────────────────────────────────────────────────────────
 *   Without a whitelist, a malicious client could:
 *     ?sort=password:asc   → expose sensitive data via sort order
 *     ?sort=deletedAt:asc  → reveal soft-deleted records' delete dates
 *     ?sort=fakeField:asc  → crash Prisma with an unknown field error
 *
 *   The whitelist restricts sorting to safe, meaningful fields only.
 *   Any field not in this list is silently ignored by parseSortParam().
 *
 * C# equivalent:
 *   private static readonly HashSet<string> AllowedSortFields = new()
 *     { "name", "price", "stock", "createdAt", "updatedAt" };
 */
const ALLOWED_SORT_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'];

// ─────────────────────────────────────────────────────────────────────────────
// Types for product queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for the findActiveProducts() method.
 *
 * These map to query string parameters from the HTTP request:
 *   GET /api/v1/products?page=2&limit=10&categoryId=xxx&minPrice=10&maxPrice=50
 *       &search=phone&sort=price:asc&cursor=abc-123
 *
 * Phase 7 added: sort, cursor
 *
 * C# equivalent: a ProductFilterDto or ProductQueryParameters class
 */
export interface FindActiveProductsParams {
  page: number;
  limit: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /** Sort string in "field:direction" format, e.g., "price:asc,name:desc" */
  sort?: string;
  /** Cursor ID for cursor-based pagination (ID of last item from previous page) */
  cursor?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Repository Class
// ─────────────────────────────────────────────────────────────────────────────

class ProductRepository extends BaseRepository {
  constructor() {
    // Pass the Prisma product delegate to the base class.
    // Now this.model = prisma.product, and all base CRUD methods work.
    //
    // C# equivalent: base(context) where _dbSet = context.Set<Product>()
    super(prisma.product);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Product-Specific READ Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find a product by its URL-friendly slug.
   *
   * Slugs are used in SEO-friendly URLs:
   *   /products/wireless-headphones  (slug)
   *   instead of
   *   /products/550e8400-e29b-41d4  (UUID — ugly in browser bar)
   *
   * Since slug has a @unique constraint, we can use findUnique (fast index lookup).
   *
   * Phase 7: Now filters out soft-deleted products.
   * We switched from findUnique to findFirst because findUnique doesn't
   * support filtering by non-unique fields (deletedAt).
   *
   * C# equivalent:
   *   await _dbSet.FirstOrDefaultAsync(p => p.Slug == slug && p.DeletedAt == null);
   */
  async findBySlug(slug: string) {
    return prisma.product.findFirst({
      where: { slug, deletedAt: null },
      // Include the category so the API response shows category info
      include: { category: true },
    });
  }

  /**
   * Find a product by its SKU (Stock Keeping Unit).
   *
   * SKU is a unique inventory identifier used by warehouse/inventory systems.
   * Example: "WH-BLK-001" for "Wireless Headphones, Black, version 001"
   *
   * Phase 7: Now filters out soft-deleted products.
   *
   * C# equivalent:
   *   await _dbSet.FirstOrDefaultAsync(p => p.Sku == sku && p.DeletedAt == null);
   */
  async findBySku(sku: string) {
    return prisma.product.findFirst({
      where: { sku, deletedAt: null },
    });
  }

  /**
   * Find a product by ID with its category eagerly loaded.
   *
   * "Eager loading" means fetching related data in the SAME query (via JOIN).
   * Without it, you'd need a separate query to get the category — that's
   * the "N+1 problem" (1 query for product + 1 query for category).
   *
   * Phase 7: Now filters out soft-deleted products.
   *
   * Prisma's `include` is like EF Core's `.Include()`:
   *   C#:     _dbSet.Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == id)
   *   Prisma: prisma.product.findFirst({ where: { id }, include: { category: true } })
   */
  async findWithCategory(id: string) {
    return prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
  }

  /**
   * Find active products with pagination, filtering, sorting, and search.
   *
   * This is the MAIN product listing method — used by the storefront.
   * It supports:
   *   - Pagination: offset (page + limit) OR cursor-based
   *   - Category filter (only products in a specific category)
   *   - Price range filter (minPrice ≤ price ≤ maxPrice)
   *   - Text search (searches name and description)
   *   - Dynamic sorting (sort by any whitelisted field, any direction)
   *
   * Returns BOTH the products AND total count (for offset pagination metadata).
   * When using cursor pagination, total is still returned but may be omitted
   * by the controller (cursor pagination doesn't need it).
   *
   * PHASE 7 ADDITIONS:
   * ────────────────────────────────────────────────────────────────────────
   *   1. `deletedAt: null` filter — excludes soft-deleted products
   *   2. Dynamic `orderBy` via parseSortParam() — client controls sort order
   *   3. Cursor pagination branch — if `cursor` is provided, uses Prisma cursor
   *
   * HOW CURSOR VS OFFSET IS CHOSEN:
   * ────────────────────────────────────────────────────────────────────────
   *   - If `cursor` param is present → cursor pagination
   *   - Otherwise → offset pagination (default, backwards-compatible)
   *
   *   Both modes use the same WHERE clause and orderBy. The only difference
   *   is how they "slice" the results (skip/take vs cursor/skip/take).
   */
  async findActiveProducts(params: FindActiveProductsParams) {
    const { page, limit, categoryId, minPrice, maxPrice, search, sort, cursor } = params;

    // ── Build WHERE clause ──────────────────────────────────────────────
    // Start with: only active products that haven't been soft-deleted.
    //
    // `deletedAt: null` is the soft-delete filter:
    //   - null means the product is alive (not deleted)
    //   - A timestamp means it was deleted at that time
    //
    // C# equivalent with global query filter:
    //   modelBuilder.Entity<Product>()
    //     .HasQueryFilter(p => p.DeletedAt == null && p.IsActive);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
      deletedAt: null,
    };

    // Category filter — only products in a specific category
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Price range filter — uses Prisma's comparison operators:
    //   gte = greater than or equal (>=)
    //   lte = less than or equal (<=)
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    // Text search — searches both name AND description.
    // Prisma's `contains` does a SQL LIKE '%search%' (case-insensitive with `mode`).
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ── Build ORDER BY ──────────────────────────────────────────────────
    // Parse the client's sort string into a Prisma orderBy array.
    // If no valid sort is provided, default to newest first.
    //
    // The ALLOWED_SORT_FIELDS whitelist ensures clients can't sort by
    // internal or sensitive fields.
    //
    // C# equivalent:
    //   IQueryable<Product> query = sort switch {
    //     "price:asc" => query.OrderBy(p => p.Price),
    //     "name:desc" => query.OrderByDescending(p => p.Name),
    //     _ => query.OrderByDescending(p => p.CreatedAt),
    //   };
    const orderBy: OrderByEntry[] = sort
      ? parseSortParam(sort, ALLOWED_SORT_FIELDS) ?? [{ createdAt: 'desc' }]
      : [{ createdAt: 'desc' }];

    // ── Choose pagination mode ──────────────────────────────────────────
    if (cursor) {
      // CURSOR PAGINATION MODE
      //
      // Instead of "skip N rows", we say "start after this specific record".
      // Prisma handles this natively with the `cursor` option.
      //
      // buildCursorArgs returns:
      //   { cursor: { id: cursorId }, skip: 1, take: limit }
      //
      // The `skip: 1` skips the cursor record itself (the client already has it).
      //
      // Why is cursor pagination faster?
      //   Offset: SELECT * FROM products ORDER BY id OFFSET 10000 LIMIT 10
      //     → DB must scan and skip 10,000 rows to find the 10 you want
      //
      //   Cursor: SELECT * FROM products WHERE id > 'cursor-id' ORDER BY id LIMIT 10
      //     → DB uses the index to jump directly to the cursor position
      //
      // The difference is dramatic on large tables (millions of rows).
      const cursorArgs = buildCursorArgs(cursor, limit);
      const products = await prisma.product.findMany({
        where,
        include: { category: true },
        orderBy,
        ...cursorArgs,
      });

      // We still return total for clients that want it, but cursor pagination
      // responses typically focus on nextCursor + hasMore (see controller).
      const total = await prisma.product.count({ where });
      return { products, total };
    }

    // OFFSET PAGINATION MODE (default)
    //
    // Traditional page-based pagination: skip (page-1)*limit, take limit.
    // This is simpler and supports "jump to page 5" but slower on large datasets.
    const skip = (page - 1) * limit;

    // Execute BOTH queries in parallel using Promise.all.
    // The product list query and count query are INDEPENDENT — neither needs
    // the other's result. Running them in parallel is faster.
    //
    // C# equivalent:
    //   var productsTask = query.Skip(skip).Take(limit).ToListAsync();
    //   var countTask = query.CountAsync();
    //   await Task.WhenAll(productsTask, countTask);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Product-Specific WRITE Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update a product's stock quantity.
   *
   * Separated from general update() because stock changes happen frequently
   * (order placed, inventory received, etc.) and we might want to add
   * business logic around stock updates later (e.g., emit events, check
   * for low stock alerts).
   *
   * @param id       - Product ID
   * @param quantity - New stock quantity
   */
  async updateStock(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: { stock: quantity },
    });
  }

  /**
   * Soft-delete a product by setting its `deletedAt` timestamp.
   *
   * SOFT DELETE vs HARD DELETE:
   * ────────────────────────────────────────────────────────────────────────
   *   Hard delete: DELETE FROM products WHERE id = ?
   *     → Row is GONE. Permanently. No undo. Foreign keys break.
   *
   *   Soft delete: UPDATE products SET deleted_at = NOW() WHERE id = ?
   *     → Row stays in DB but is filtered out of all read queries.
   *     → You can "undelete" by setting deletedAt back to null.
   *     → Order history still references this product (no broken FKs).
   *     → You know WHEN it was deleted (audit trail).
   *
   *   Soft delete is standard in production e-commerce apps because:
   *     1. Orders reference products — can't delete products with orders
   *     2. Legal/compliance may require data retention
   *     3. Admins accidentally delete things — soft delete is recoverable
   *
   * C# equivalent:
   *   public async Task SoftDeleteAsync(Guid id) {
   *     var product = await _dbSet.FindAsync(id);
   *     product.DeletedAt = DateTime.UtcNow;
   *     await _context.SaveChangesAsync();
   *   }
   *
   * @param id - Product UUID to soft-delete
   * @returns The updated product with deletedAt set
   */
  async softDelete(id: string) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Find a product by slug WITHOUT excluding soft-deleted products.
   *
   * Used internally by the service layer when checking slug uniqueness
   * during product creation. We need to check ALL products (including
   * soft-deleted ones) because slugs must be unique in the DB.
   *
   * @param slug - The slug to check
   * @returns The product if found (including soft-deleted), null otherwise
   */
  async findBySlugIncludeDeleted(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

export const productRepository = new ProductRepository();

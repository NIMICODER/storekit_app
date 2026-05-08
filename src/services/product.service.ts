// src/services/product.service.ts — Product Business Logic

import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import type { FindActiveProductsParams } from '../repositories/product.repository';
import { NotFoundError, ConflictError } from '../errors';
import { generateSlug } from '../utils/slug';
import { clearCache } from '../middleware/cache';

// ── Product Service ──────────────────────────────────────────────────────────

class ProductService {
  constructor(
    private productRepo: typeof productRepository,
    private categoryRepo: typeof categoryRepository,
  ) {}

  // ── Read Operations ──────────────────────────────────────────────────────

  /** Get a paginated, filtered, sorted list of active products. */
  async getProducts(params: FindActiveProductsParams) {
    return this.productRepo.findActiveProducts(params);
  }

  /**
   * @param id - Product UUID
   * @throws NotFoundError if product not found or soft-deleted
   */
  async getProductById(id: string) {
    const product = await this.productRepo.findWithCategory(id);

    if (!product) {
      throw new NotFoundError('Product', id);
    }

    return product;
  }

  /**
   * @param slug - URL-friendly product identifier
   * @throws NotFoundError if product not found
   */
  async getProductBySlug(slug: string) {
    const product = await this.productRepo.findBySlug(slug);

    if (!product) {
      throw new NotFoundError('Product', slug, 'slug');
    }

    return product;
  }

  // ── Write Operations ─────────────────────────────────────────────────────

  /**
   * Create a new product. Auto-generates slug from name if not provided.
   * Enforces slug uniqueness, SKU uniqueness, and category existence.
   * @throws ConflictError if slug or SKU already exists
   * @throws NotFoundError if category not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createProduct(data: any) {
    if (!data.slug) {
      data.slug = await this.generateUniqueSlug(data.name);
    } else {
      // Check against all products (including soft-deleted) due to DB unique constraint
      const existingSlug = await this.productRepo.findBySlugIncludeDeleted(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Product with slug '${data.slug}' already exists`);
      }
    }

    if (data.sku) {
      const existingSku = await this.productRepo.findBySku(data.sku);
      if (existingSku) {
        throw new ConflictError(`Product with SKU '${data.sku}' already exists`);
      }
    }

    if (data.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) {
        throw new NotFoundError('Category', data.categoryId);
      }
    }

    const product = await this.productRepo.create(data);

    // Bust all cached product lists/details so new product appears immediately.
    // In C#, you'd call IDistributedCache.Remove() for each affected key,
    // or use cache tags with IOutputCacheStore.EvictByTagAsync().
    await clearCache('products');

    return product;
  }

  /**
   * Update an existing product.
   * Enforces existence, slug uniqueness, SKU uniqueness, and category existence.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateProduct(id: string, data: any) {
    const existing = await this.productRepo.findWithCategory(id);
    if (!existing) {
      throw new NotFoundError('Product', id);
    }

    if (data.slug && data.slug !== existing.slug) {
      const existingSlug = await this.productRepo.findBySlugIncludeDeleted(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Product with slug '${data.slug}' already exists`);
      }
    }

    if (data.sku && data.sku !== existing.sku) {
      const existingSku = await this.productRepo.findBySku(data.sku);
      if (existingSku) {
        throw new ConflictError(`Product with SKU '${data.sku}' already exists`);
      }
    }

    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) {
        throw new NotFoundError('Category', data.categoryId);
      }
    }

    const product = await this.productRepo.update(id, data);

    // Any update could change list order, detail view, or slug lookup — clear all.
    await clearCache('products');

    return product;
  }

  /**
   * Soft-delete a product (sets deletedAt). Preserves data for audit trail and order history.
   * @throws NotFoundError if product not found or already soft-deleted
   */
  async deleteProduct(id: string) {
    const existing = await this.productRepo.findWithCategory(id);
    if (!existing) {
      throw new NotFoundError('Product', id);
    }

    const product = await this.productRepo.softDelete(id);

    // Soft-deleted product must vanish from all cached lists and detail views.
    await clearCache('products');

    return product;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Generate a unique slug from a product name, appending -2, -3, etc. if taken.
   * Checks against all products (including soft-deleted) due to DB unique constraint.
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = generateSlug(name);
    let slug = baseSlug;
    let suffix = 2;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.productRepo.findBySlugIncludeDeleted(slug);
      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${suffix}`;
      suffix++;

      // Safety fallback after 100 attempts
      if (suffix > 100) {
        slug = `${baseSlug}-${Date.now()}`;
        return slug;
      }
    }
  }
}

// ── Export Singleton ──────────────────────────────────────────────────────────

export const productService = new ProductService(productRepository, categoryRepository);

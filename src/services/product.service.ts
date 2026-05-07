/**
 * src/services/product.service.ts — Product Business Logic Layer
 *
 * PURPOSE:
 *   Contains ALL business logic for product operations.
 *   Sits BETWEEN controllers and repositories:
 *
 *     Controller  →  Service  →  Repository  →  Database
 *     (HTTP)         (logic)     (data access)   (Prisma/PG)
 *
 * WHY A SERVICE LAYER?
 * ───────────────────────────────────────────────────────────────────────────
 *   Controllers should be THIN — they parse HTTP requests and send responses.
 *   Repositories should be THIN — they execute database queries.
 *
 *   Business logic lives in the SERVICE:
 *     - "Is this slug already taken?" → service checks via repository
 *     - "Does the category exist?" → service validates before creating product
 *     - "Is the SKU unique?" → service enforces business rules
 *     - "Auto-generate slug from name" → service creates the slug (Phase 7)
 *
 * PHASE 7 CHANGES:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. createProduct() now auto-generates a slug from the product name
 *      if the client doesn't provide one (with uniqueness suffix -2, -3, etc.)
 *   2. deleteProduct() now calls softDelete() instead of hard delete
 *   3. getProducts() passes sort and cursor params through to the repository
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   public class ProductService : IProductService {
 *     private readonly IProductRepository _productRepo;
 *     private readonly ICategoryRepository _categoryRepo;
 *   }
 *
 * DEPENDENCY INJECTION (Node.js style):
 * ───────────────────────────────────────────────────────────────────────────
 *   In C#, you use the DI container: services.AddScoped<IProductService, ProductService>()
 *   In Node.js, we import singletons directly — the module system IS the DI container.
 *
 * ERROR HANDLING:
 * ───────────────────────────────────────────────────────────────────────────
 *   Services throw CUSTOM ERROR CLASSES:
 *     - NotFoundError  → 404 (resource doesn't exist)
 *     - ConflictError  → 409 (uniqueness violation)
 *   The global errorHandler middleware formats these into standardized JSON.
 */

import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import type { FindActiveProductsParams } from '../repositories/product.repository';
import { NotFoundError, ConflictError } from '../errors';
import { generateSlug } from '../utils/slug';

// ─────────────────────────────────────────────────────────────────────────────
// Product Service Class
// ─────────────────────────────────────────────────────────────────────────────

class ProductService {
  /**
   * Constructor — receives repository instances.
   *
   * Why pass them in instead of importing directly inside methods?
   *   1. TESTABILITY: In unit tests, you can pass mock repositories
   *   2. EXPLICITNESS: Dependencies are visible in the constructor
   *   3. SAME PATTERN AS C#: constructor injection
   */
  constructor(
    private productRepo: typeof productRepository,
    private categoryRepo: typeof categoryRepository,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // READ Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a paginated, filtered, sorted list of active products.
   *
   * This is the main "product listing" for the storefront.
   * The controller passes parsed query params; this method delegates
   * to the repository and returns results + pagination metadata.
   *
   * Phase 7: Now passes sort and cursor params through to the repository.
   *
   * @param params - Page, limit, filters, sort, and cursor
   * @returns { products, total }
   */
  async getProducts(params: FindActiveProductsParams) {
    return this.productRepo.findActiveProducts(params);
  }

  /**
   * Get a single product by its UUID.
   *
   * Throws NotFoundError if the product doesn't exist (or is soft-deleted).
   *
   * @param id - Product UUID
   * @returns The product with its category
   * @throws NotFoundError if product not found
   */
  async getProductById(id: string) {
    const product = await this.productRepo.findWithCategory(id);

    if (!product) {
      throw new NotFoundError('Product', id);
    }

    return product;
  }

  /**
   * Get a single product by its URL slug.
   *
   * Used for SEO-friendly URLs: /products/wireless-headphones
   *
   * @param slug - URL-friendly product identifier
   * @returns The product with its category
   * @throws NotFoundError if product not found
   */
  async getProductBySlug(slug: string) {
    const product = await this.productRepo.findBySlug(slug);

    if (!product) {
      throw new NotFoundError('Product', slug, 'slug');
    }

    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new product.
   *
   * Business rules enforced:
   *   1. If no slug provided, auto-generate from name (with uniqueness handling)
   *   2. Slug must be unique (no two products with the same URL)
   *   3. SKU must be unique (if provided)
   *   4. Category must exist (if categoryId is provided)
   *
   * SLUG AUTO-GENERATION (Phase 7):
   * ────────────────────────────────────────────────────────────────────────
   *   If the client doesn't send a slug, we generate one from the product name:
   *     name: "Wireless Headphones" → slug: "wireless-headphones"
   *
   *   If that slug is already taken, we append a numeric suffix:
   *     "wireless-headphones-2", "wireless-headphones-3", etc.
   *
   *   This is the same pattern as WordPress, Shopify, and most CMS platforms.
   *   It means the client NEVER has to worry about slug creation — just
   *   send a name and the API handles the rest.
   *
   *   If the client DOES send a slug, we use it as-is (after uniqueness check).
   *
   * C# equivalent:
   *   public async Task<Product> CreateProductAsync(CreateProductDto dto) {
   *     dto.Slug ??= await GenerateUniqueSlugAsync(dto.Name);
   *     if (await _productRepo.SlugExistsAsync(dto.Slug))
   *       throw new ConflictException("Slug already exists");
   *     return await _productRepo.CreateAsync(mapper.Map<Product>(dto));
   *   }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createProduct(data: any) {
    // Rule 1: Auto-generate slug from name if not provided
    if (!data.slug) {
      data.slug = await this.generateUniqueSlug(data.name);
    } else {
      // Client provided a slug — check uniqueness (including soft-deleted products,
      // because the slug column has a DB-level unique constraint)
      const existingSlug = await this.productRepo.findBySlugIncludeDeleted(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Product with slug '${data.slug}' already exists`);
      }
    }

    // Rule 2: SKU must be unique (if provided)
    if (data.sku) {
      const existingSku = await this.productRepo.findBySku(data.sku);
      if (existingSku) {
        throw new ConflictError(`Product with SKU '${data.sku}' already exists`);
      }
    }

    // Rule 3: Category must exist (if categoryId provided)
    if (data.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) {
        throw new NotFoundError('Category', data.categoryId);
      }
    }

    return this.productRepo.create(data);
  }

  /**
   * Update an existing product.
   *
   * Business rules:
   *   1. Product must exist (and not be soft-deleted)
   *   2. If slug is being changed, new slug must be unique
   *   3. If SKU is being changed, new SKU must be unique
   *   4. If categoryId is being changed, new category must exist
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateProduct(id: string, data: any) {
    // Rule 1: Product must exist (findWithCategory filters soft-deleted)
    const existing = await this.productRepo.findWithCategory(id);
    if (!existing) {
      throw new NotFoundError('Product', id);
    }

    // Rule 2: If changing slug, check uniqueness
    if (data.slug && data.slug !== existing.slug) {
      const existingSlug = await this.productRepo.findBySlugIncludeDeleted(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Product with slug '${data.slug}' already exists`);
      }
    }

    // Rule 3: If changing SKU, check uniqueness
    if (data.sku && data.sku !== existing.sku) {
      const existingSku = await this.productRepo.findBySku(data.sku);
      if (existingSku) {
        throw new ConflictError(`Product with SKU '${data.sku}' already exists`);
      }
    }

    // Rule 4: If changing category, verify it exists
    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) {
        throw new NotFoundError('Category', data.categoryId);
      }
    }

    return this.productRepo.update(id, data);
  }

  /**
   * Soft-delete a product by ID.
   *
   * Phase 7 CHANGE: Uses softDelete() instead of hard delete.
   *
   * Instead of permanently removing the record, we set `deletedAt` to now().
   * The product disappears from all listings and API responses but remains
   * in the database for:
   *   1. Audit trail — know when and what was deleted
   *   2. Order history — existing orders still reference this product
   *   3. Recovery — an admin can "undelete" by clearing deletedAt
   *
   * @param id - Product UUID
   * @throws NotFoundError if product not found (or already soft-deleted)
   */
  async deleteProduct(id: string) {
    // Verify product exists and isn't already deleted.
    // findWithCategory filters deletedAt: null, so if it returns null,
    // the product either doesn't exist or is already soft-deleted.
    const existing = await this.productRepo.findWithCategory(id);
    if (!existing) {
      throw new NotFoundError('Product', id);
    }

    return this.productRepo.softDelete(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a unique slug from a product name.
   *
   * Strategy:
   *   1. Convert name to slug: "Wireless Headphones" → "wireless-headphones"
   *   2. Check if that slug exists in the DB
   *   3. If taken, try "wireless-headphones-2", then "-3", "-4", etc.
   *   4. Stop when we find a slug that's not taken
   *
   * WHY CHECK UP TO 100?
   * ────────────────────────────────────────────────────────────────────────
   *   In practice, you'd rarely have more than a few products with the
   *   same base name. The limit of 100 is a safety net — if you have 100
   *   products all named "Wireless Headphones", something is probably wrong.
   *
   *   WordPress does the same thing with a similar limit.
   *
   * WHY findBySlugIncludeDeleted()?
   * ────────────────────────────────────────────────────────────────────────
   *   The slug column has a UNIQUE constraint in the database.
   *   Even soft-deleted products occupy their slug in the DB.
   *   So we must check against ALL products (including deleted ones)
   *   to avoid a DB-level unique violation error.
   *
   * C# equivalent:
   *   private async Task<string> GenerateUniqueSlugAsync(string name) {
   *     var baseSlug = SlugHelper.Generate(name);
   *     var slug = baseSlug;
   *     var suffix = 2;
   *     while (await _dbSet.AnyAsync(p => p.Slug == slug)) {
   *       slug = $"{baseSlug}-{suffix++}";
   *     }
   *     return slug;
   *   }
   *
   * @param name - The product name to generate a slug from
   * @returns A unique slug string
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = generateSlug(name);
    let slug = baseSlug;
    let suffix = 2;

    // Keep trying until we find a slug that's not taken.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.productRepo.findBySlugIncludeDeleted(slug);
      if (!existing) {
        return slug; // This slug is available — use it!
      }

      // Slug is taken — try with a numeric suffix
      slug = `${baseSlug}-${suffix}`;
      suffix++;

      // Safety net — don't loop forever
      if (suffix > 100) {
        // At this point, append a random string to guarantee uniqueness
        slug = `${baseSlug}-${Date.now()}`;
        return slug;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const productService = new ProductService(productRepository, categoryRepository);

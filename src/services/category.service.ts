/**
 * src/services/category.service.ts — Category Business Logic Layer
 *
 * PURPOSE:
 *   Contains ALL business logic for category operations.
 *   Enforces rules like slug uniqueness, parent validation,
 *   and preventing circular references.
 *
 * BUSINESS RULES:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. Slug must be unique across all categories
 *   2. If a parent category is specified, it must exist
 *   3. A category cannot be its own parent (no circular self-reference)
 *   4. Category must exist before update/delete
 *
 * ERROR HANDLING (Phase 5):
 * ───────────────────────────────────────────────────────────────────────────
 *   Now uses custom error classes instead of (error as any).statusCode hacks:
 *     - NotFoundError  → 404 (category or parent not found)
 *     - ConflictError  → 409 (slug already exists)
 *     - BadRequestError → 400 (circular reference attempt)
 *
 * C# EQUIVALENT:
 *   public class CategoryService : ICategoryService {
 *     private readonly ICategoryRepository _categoryRepo;
 *     // ... constructor injection + business methods
 *   }
 */

import { categoryRepository } from '../repositories/category.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// Category Service Class
// ─────────────────────────────────────────────────────────────────────────────

class CategoryService {
  constructor(
    private categoryRepo: typeof categoryRepository,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // READ Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all categories as a flat list.
   *
   * Returns every category with its parent and children included.
   * Useful for admin views where you need a simple list.
   */
  async getCategories() {
    return this.categoryRepo.findAll({
      include: { parent: true, children: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get all categories as a nested tree structure.
   *
   * Returns root categories with children and grandchildren.
   * Useful for navigation menus and category browsers.
   *
   * Example response:
   *   [
   *     { name: "Electronics", children: [
   *       { name: "Phones", children: [
   *         { name: "Smartphones", children: [] }
   *       ] },
   *       { name: "Laptops", children: [] }
   *     ] }
   *   ]
   */
  async getCategoryTree() {
    return this.categoryRepo.findAllTree();
  }

  /**
   * Get a single category by its UUID.
   *
   * @param id - Category UUID
   * @returns Category with parent and children
   * @throws NotFoundError if category not found
   */
  async getCategoryById(id: string) {
    const category = await this.categoryRepo.findWithChildren(id);

    if (!category) {
      throw new NotFoundError('Category', id);
    }

    return category;
  }

  /**
   * Get a single category by its URL slug.
   *
   * @param slug - URL-friendly category identifier
   * @returns Category with parent and children
   * @throws NotFoundError if category not found
   */
  async getCategoryBySlug(slug: string) {
    const category = await this.categoryRepo.findBySlug(slug);

    if (!category) {
      throw new NotFoundError('Category', slug, 'slug');
    }

    return category;
  }

  /**
   * Get a category with its active products (paginated).
   *
   * Used for "category page" — shows category info + products.
   *
   * @param id    - Category UUID
   * @param page  - Page number
   * @param limit - Products per page
   * @returns { category, products, total }
   * @throws NotFoundError if category not found
   */
  async getCategoryWithProducts(id: string, page: number, limit: number) {
    const result = await this.categoryRepo.findWithProducts(id, page, limit);

    if (!result.category) {
      throw new NotFoundError('Category', id);
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new category.
   *
   * Business rules:
   *   1. Slug must be unique
   *   2. If parentId is provided, parent category must exist
   *
   * @param data - Category creation data
   * @returns The created category
   * @throws ConflictError if slug already exists
   * @throws NotFoundError if parent category not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createCategory(data: any) {
    // Rule 1: Slug must be unique
    if (data.slug) {
      const existingSlug = await this.categoryRepo.findBySlug(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Category with slug '${data.slug}' already exists`);
      }
    }

    // Rule 2: Parent must exist (if specified)
    if (data.parentId) {
      const parent = await this.categoryRepo.findById(data.parentId);
      if (!parent) {
        throw new NotFoundError('Parent category', data.parentId);
      }
    }

    return this.categoryRepo.create(data);
  }

  /**
   * Update an existing category.
   *
   * Business rules:
   *   1. Category must exist
   *   2. If changing slug, new slug must be unique
   *   3. If changing parent, new parent must exist
   *   4. Cannot set parentId to own id (circular self-reference)
   *
   * CIRCULAR REFERENCE PREVENTION:
   * ────────────────────────────────────────────────────────────────────────
   *   A category cannot be its own parent. This would create an infinite
   *   loop in the tree:
   *
   *     Electronics → parentId = Electronics.id  ← INVALID!
   *
   *   We check: if parentId === id, reject the request.
   *
   *   NOTE: A more thorough check would walk up the tree to prevent
   *   indirect cycles (A → B → C → A). For our 2-level tree, the simple
   *   self-reference check is sufficient.
   *
   * @param id   - Category UUID
   * @param data - Fields to update
   * @returns The updated category
   * @throws NotFoundError if category or parent not found
   * @throws ConflictError if slug already exists
   * @throws BadRequestError if circular reference detected
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateCategory(id: string, data: any) {
    // Rule 1: Category must exist
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Category', id);
    }

    // Rule 4: Cannot be its own parent (must check before Rule 3)
    if (data.parentId && data.parentId === id) {
      throw new BadRequestError('A category cannot be its own parent');
    }

    // Rule 2: If changing slug, check uniqueness
    if (data.slug && data.slug !== existing.slug) {
      const existingSlug = await this.categoryRepo.findBySlug(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Category with slug '${data.slug}' already exists`);
      }
    }

    // Rule 3: If changing parent, verify it exists
    if (data.parentId && data.parentId !== existing.parentId) {
      const parent = await this.categoryRepo.findById(data.parentId);
      if (!parent) {
        throw new NotFoundError('Parent category', data.parentId);
      }
    }

    return this.categoryRepo.update(id, data);
  }

  /**
   * Delete a category by ID.
   *
   * When a category is deleted, its products' categoryId is set to NULL
   * (due to onDelete: SetNull in the Prisma schema). Child categories
   * also get parentId set to NULL, making them root categories.
   *
   * @param id - Category UUID
   * @throws NotFoundError if category not found
   */
  async deleteCategory(id: string) {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Category', id);
    }

    return this.categoryRepo.delete(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const categoryService = new CategoryService(categoryRepository);

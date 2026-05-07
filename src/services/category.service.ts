// src/services/category.service.ts — Category Business Logic

import { categoryRepository } from '../repositories/category.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../errors';

// ── Category Service ─────────────────────────────────────────────────────────

class CategoryService {
  constructor(
    private categoryRepo: typeof categoryRepository,
  ) {}

  // ── Read Operations ──────────────────────────────────────────────────────

  /** Get all categories as a flat list with parent/children included. */
  async getCategories() {
    return this.categoryRepo.findAll({
      include: { parent: true, children: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Get all categories as a nested tree (root → children → grandchildren). */
  async getCategoryTree() {
    return this.categoryRepo.findAllTree();
  }

  /**
   * @param id - Category UUID
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
   * @param slug - URL-friendly category identifier
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

  // ── Write Operations ─────────────────────────────────────────────────────

  /**
   * Create a new category. Enforces slug uniqueness and parent existence.
   * @throws ConflictError if slug already exists
   * @throws NotFoundError if parent category not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createCategory(data: any) {
    if (data.slug) {
      const existingSlug = await this.categoryRepo.findBySlug(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Category with slug '${data.slug}' already exists`);
      }
    }

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
   * Enforces existence, slug uniqueness, parent existence, and no self-reference.
   * @throws NotFoundError if category or parent not found
   * @throws ConflictError if slug already exists
   * @throws BadRequestError if circular reference detected
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateCategory(id: string, data: any) {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Category', id);
    }

    // Prevent self-referencing parent
    if (data.parentId && data.parentId === id) {
      throw new BadRequestError('A category cannot be its own parent');
    }

    if (data.slug && data.slug !== existing.slug) {
      const existingSlug = await this.categoryRepo.findBySlug(data.slug);
      if (existingSlug) {
        throw new ConflictError(`Category with slug '${data.slug}' already exists`);
      }
    }

    if (data.parentId && data.parentId !== existing.parentId) {
      const parent = await this.categoryRepo.findById(data.parentId);
      if (!parent) {
        throw new NotFoundError('Parent category', data.parentId);
      }
    }

    return this.categoryRepo.update(id, data);
  }

  /**
   * Delete a category. Products and children get their FK set to NULL (onDelete: SetNull).
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

// ── Export Singleton ──────────────────────────────────────────────────────────

export const categoryService = new CategoryService(categoryRepository);

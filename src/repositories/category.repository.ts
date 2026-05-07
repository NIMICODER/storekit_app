// ── Category Repository ─────────────────────────────────────────────────────
// Data access for the Category model. Categories form a tree via self-referencing parentId.

import { BaseRepository } from './base.repository';
import prisma from '../config/database';

class CategoryRepository extends BaseRepository {
  constructor() {
    super(prisma.category);
  }

  // ── Read Methods ────────────────────────────────────────────────────────

  /** Find a category by slug, including parent and children for tree context. */
  async findBySlug(slug: string) {
    return prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  /** Find a category by ID with its direct parent and children. */
  async findWithChildren(id: string) {
    return prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  /** Find all root categories (parentId = null) with their direct children. */
  async findRootCategories() {
    return prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Find all categories as a tree (root → children → grandchildren, 2 levels deep). */
  async findAllTree() {
    return prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: {
            children: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find a category with its active products (paginated).
   * Runs category fetch, product list, and product count in parallel.
   * @param id    - Category ID
   * @param page  - Page number (1-indexed)
   * @param limit - Products per page
   */
  async findWithProducts(id: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [category, products, total] = await Promise.all([
      prisma.category.findUnique({
        where: { id },
        include: { parent: true, children: true },
      }),
      prisma.product.findMany({
        where: {
          categoryId: id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.product.count({
        where: {
          categoryId: id,
          isActive: true,
        },
      }),
    ]);

    return { category, products, total };
  }
}

// ── Export Singleton ───────────────────────────────────────────────────────────

export const categoryRepository = new CategoryRepository();

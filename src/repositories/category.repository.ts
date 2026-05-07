/**
 * src/repositories/category.repository.ts — Category Data Access Layer
 *
 * PURPOSE:
 *   Handles ALL database interactions for the Category model.
 *   Extends BaseRepository with category-specific query methods.
 *
 * CATEGORY HIERARCHY:
 * ───────────────────────────────────────────────────────────────────────────
 *   Categories form a TREE structure via self-referencing:
 *
 *     Electronics (root)
 *     ├── Phones
 *     │   └── Smartphones    (child of Phones)
 *     ├── Laptops
 *     └── Audio
 *
 *   Each category has an optional `parentId` pointing to its parent.
 *   Root categories have parentId = null.
 *
 *   C# equivalent:
 *     public class Category {
 *       public Guid? ParentId { get; set; }
 *       public Category? Parent { get; set; }
 *       public ICollection<Category> Children { get; set; }
 *     }
 *
 * SINGLETON EXPORT:
 *   Same pattern as productRepository — module-level singleton.
 */

import { BaseRepository } from './base.repository';
import prisma from '../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Category Repository Class
// ─────────────────────────────────────────────────────────────────────────────

class CategoryRepository extends BaseRepository {
  constructor() {
    // Pass the Prisma category delegate to base class
    super(prisma.category);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Category-Specific READ Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find a category by its URL-friendly slug.
   *
   * Like products, categories have slugs for clean URLs:
   *   /categories/electronics  instead of  /categories/550e8400-...
   */
  async findBySlug(slug: string) {
    return prisma.category.findUnique({
      where: { slug },
      // Include parent and children so the response shows the tree context
      include: {
        parent: true,
        children: true,
      },
    });
  }

  /**
   * Find a category by ID with its children eagerly loaded.
   *
   * "Children" = categories whose parentId matches this category's id.
   * This is a ONE-LEVEL include — it gets direct children, not grandchildren.
   *
   * To get deeper nesting, see findAllTree() below.
   */
  async findWithChildren(id: string) {
    return prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  /**
   * Find all root categories (top-level, no parent).
   *
   * Root categories are the "top menu items" — Electronics, Clothing, Home, etc.
   * They have parentId = null.
   *
   * C# equivalent:
   *   _dbSet.Where(c => c.ParentId == null).ToListAsync()
   */
  async findRootCategories() {
    return prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find ALL categories as a tree structure (2 levels deep).
   *
   * Returns root categories → their children → their grandchildren.
   *
   * This is useful for rendering a navigation menu or category browser:
   *
   *   Electronics
   *   ├── Phones
   *   │   ├── Smartphones
   *   │   └── Feature Phones
   *   └── Laptops
   *       ├── Gaming
   *       └── Business
   *
   * HOW NESTED INCLUDES WORK:
   * ────────────────────────────────────────────────────────────────────────
   *   Prisma allows nested `include` — each level eagerly loads the next:
   *
   *   include: {
   *     children: {                    // Level 1: direct children
   *       include: {
   *         children: true             // Level 2: grandchildren
   *       }
   *     }
   *   }
   *
   *   C# equivalent (EF Core):
   *     _dbSet
   *       .Where(c => c.ParentId == null)
   *       .Include(c => c.Children)
   *         .ThenInclude(c => c.Children)
   *       .ToListAsync();
   *
   *   Both generate SQL with JOINs to pull all the related data.
   *
   * DEPTH LIMIT:
   *   We only go 2 levels deep. For deeper trees, you'd use a recursive
   *   CTE (Common Table Expression) in raw SQL. For our e-commerce store,
   *   2 levels (root → subcategory → sub-subcategory) is plenty.
   */
  async findAllTree() {
    return prisma.category.findMany({
      where: { parentId: null }, // Start with root categories
      include: {
        children: {
          include: {
            children: true, // Grandchildren (2 levels deep)
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find a category with its ACTIVE products (paginated).
   *
   * Used for the "category page" — shows the category info + its products.
   *
   * @param id    - Category ID
   * @param page  - Page number (1-indexed)
   * @param limit - Products per page
   *
   * Returns the category AND its paginated products + total count.
   *
   * WHY NOT JUST include: { products: true }?
   *   That would load ALL products at once — potentially thousands.
   *   For a category page, we want paginated results (e.g., 20 per page).
   *
   *   So we run two queries:
   *     1. Get the category itself
   *     2. Get its products (filtered, paginated) + count
   *
   *   These run in parallel for performance.
   */
  async findWithProducts(id: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // Run category fetch and product queries in parallel
    const [category, products, total] = await Promise.all([
      // Query 1: Get the category (with parent/children for context)
      prisma.category.findUnique({
        where: { id },
        include: { parent: true, children: true },
      }),

      // Query 2: Get paginated active products in this category
      prisma.product.findMany({
        where: {
          categoryId: id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),

      // Query 3: Count total active products in this category
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

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const categoryRepository = new CategoryRepository();

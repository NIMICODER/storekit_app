// ── src/repositories/cart.repository.ts ── Cart Data Access ───────────
//
// CRUD operations for the Cart and CartItem models. Each user has at
// most one cart (1:1 relationship enforced by unique userId on Cart).
//
// KEY DESIGN:
//   - Cart is created lazily — only when the user first adds an item.
//   - CartItem has a composite unique constraint (cartId + productId),
//     so a product can only appear once per cart. "Add more" = update quantity.
//   - All cart reads include items + product data (eager loading), because
//     a cart without its items is useless.
//
// .NET/EF CORE COMPARISON:
//   This is like a CartRepository with methods like:
//     Task<Cart?> GetByUserIdAsync(string userId);
//     Task<CartItem> AddItemAsync(string cartId, string productId, int qty);
//   EF Core uses .Include() for eager loading — Prisma uses `include: {}`.

import prisma from '../config/database';

// ── Shared include clause ─────────────────────────────────────────────
// Reused by every query that returns a cart — always load items + products.
// In EF Core, you'd use .Include(c => c.Items).ThenInclude(i => i.Product).

const CART_INCLUDE = {
  items: {
    include: {
      product: {
        // Only include the product fields we need for cart display.
        // Keeps the payload small and avoids leaking internal fields.
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAt: true,
          stock: true,
          images: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const }, // Show items in order added
  },
} as const;

// ── Cart Repository Class ────────────────────────────────────────────

class CartRepository {
  /**
   * Find the user's cart with all items and products.
   * Returns null if the user doesn't have a cart yet.
   */
  async findByUserId(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      include: CART_INCLUDE,
    });
  }

  /**
   * Get or create a cart for the user. Lazy creation — the cart is
   * created the first time the user interacts with it.
   *
   * Uses upsert: if the cart exists, return it. If not, create it.
   * This is atomic — no race condition if two requests hit simultaneously.
   *
   * In EF Core: dbContext.Carts.AddIfNotExists() doesn't exist natively,
   * so you'd check + create in a transaction. Prisma's upsert does both.
   */
  async getOrCreate(userId: string) {
    return prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {}, // No-op update if it already exists
      include: CART_INCLUDE,
    });
  }

  /**
   * Add an item to the cart. If the product already exists in the cart,
   * increment its quantity (upsert on the composite unique).
   *
   * @param cartId - The cart's UUID
   * @param productId - Product to add
   * @param quantity - How many to add
   * @returns The updated or created cart item
   */
  async addItem(cartId: string, productId: string, quantity: number) {
    return prisma.cartItem.upsert({
      // The composite unique constraint [cartId, productId] is used for lookup.
      // Prisma requires the exact field combination from @@unique.
      where: {
        cartId_productId: { cartId, productId },
      },
      create: {
        cartId,
        productId,
        quantity,
      },
      // If the product already exists in the cart, ADD to the existing quantity.
      // increment is a Prisma atomic operation — safe for concurrent requests.
      update: {
        quantity: { increment: quantity },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            images: true,
          },
        },
      },
    });
  }

  /**
   * Update the quantity of a specific cart item.
   *
   * @param itemId - CartItem UUID (not productId!)
   * @param quantity - New absolute quantity (not a delta)
   * @returns Updated cart item
   */
  async updateItemQuantity(itemId: string, quantity: number) {
    return prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            images: true,
          },
        },
      },
    });
  }

  /**
   * Remove a specific item from the cart.
   * @param itemId - CartItem UUID to remove
   */
  async removeItem(itemId: string) {
    return prisma.cartItem.delete({
      where: { id: itemId },
    });
  }

  /**
   * Clear all items from a cart (but keep the cart record).
   * Used after successful checkout.
   *
   * @param cartId - The cart's UUID
   */
  async clearItems(cartId: string) {
    return prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  /**
   * Find a specific cart item by its ID.
   * Used to verify ownership before update/delete operations.
   */
  async findItemById(itemId: string) {
    return prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
          },
        },
      },
    });
  }

  /**
   * Find cart with items for checkout processing.
   * Returns the cart with full product info needed for order creation.
   */
  async findForCheckout(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                isActive: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const cartRepository = new CartRepository();

// ── src/services/cart.service.ts ── Cart Business Logic ───────────────
//
// Manages the shopping cart lifecycle: get cart, add/update/remove items,
// clear cart. Enforces business rules like stock validation and product
// availability before allowing cart changes.
//
// KEY PATTERNS:
//   - Lazy cart creation: Cart is created when the user first adds an item
//   - Stock validation: Can't add more items than available stock
//   - Product validation: Can't add inactive or deleted products
//   - Calculated totals: Cart total is computed on-the-fly, not stored
//
// .NET COMPARISON:
//   public class CartService : ICartService
//   {
//     Task<CartDto> GetOrCreateCartAsync(string userId);
//     Task<CartItemDto> AddItemAsync(string userId, string productId, int qty);
//     Task<CartItemDto> UpdateItemAsync(string userId, string itemId, int qty);
//     Task RemoveItemAsync(string userId, string itemId);
//     Task ClearCartAsync(string userId);
//   }

import { cartRepository } from '../repositories/cart.repository';
import { NotFoundError, BadRequestError } from '../errors';
import prisma from '../config/database';

// ── Helper: Calculate Cart Totals ─────────────────────────────────────
// Cart totals aren't stored in the DB — they're calculated on each read.
// This avoids stale totals when product prices change.
// In C#: this would be a computed property or a LINQ projection.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateCartTotals(cart: any) {
  let itemCount = 0;
  let subtotal = 0;

  for (const item of cart.items) {
    itemCount += item.quantity;
    // Prisma Decimal fields are returned as Decimal objects — convert to number
    // for arithmetic. For money calculations at scale, use a Decimal library.
    // For our purposes, JavaScript number precision is fine.
    const lineTotal = Number(item.product.price) * item.quantity;
    subtotal += lineTotal;
  }

  // Round to 2 decimal places to avoid floating-point drift (0.1 + 0.2 ≠ 0.3)
  subtotal = Math.round(subtotal * 100) / 100;

  return {
    ...cart,
    itemCount,
    subtotal,
    // For now, total = subtotal. Phase 11 doesn't implement tax/shipping/coupons.
    total: subtotal,
  };
}

// ── Cart Service Class ────────────────────────────────────────────────

class CartService {
  /**
   * Get the user's cart with all items, or create one if it doesn't exist.
   * Returns the cart with calculated totals (itemCount, subtotal, total).
   */
  async getCart(userId: string) {
    const cart = await cartRepository.getOrCreate(userId);
    return calculateCartTotals(cart);
  }

  /**
   * Add a product to the cart.
   *
   * Business rules:
   *   1. Product must exist, be active, and not soft-deleted
   *   2. Requested quantity must not exceed available stock
   *   3. If product already in cart, quantity is ADDED (not replaced)
   *   4. Cart is created lazily if it doesn't exist
   *
   * @param userId - Current user's ID
   * @param productId - Product to add
   * @param quantity - How many to add
   * @returns Updated cart with totals
   */
  async addItem(userId: string, productId: string, quantity: number) {
    // ── Validate product ──────────────────────────────────────────────
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stock: true, isActive: true, deletedAt: true },
    });

    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    if (!product.isActive || product.deletedAt) {
      throw new BadRequestError(`Product "${product.name}" is no longer available`);
    }

    // ── Check stock (including items already in cart) ──────────────────
    // If the user already has 3 of this product in their cart and wants
    // to add 2 more, we check if 5 <= stock.
    const cart = await cartRepository.getOrCreate(userId);
    const existingItem = cart.items.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (item: any) => item.productId === productId,
    );
    const existingQty = existingItem ? existingItem.quantity : 0;
    const totalQty = existingQty + quantity;

    if (totalQty > product.stock) {
      throw new BadRequestError(
        `Insufficient stock for "${product.name}". ` +
        `Available: ${product.stock}, in cart: ${existingQty}, requested: ${quantity}`,
      );
    }

    // ── Add to cart ──────────────────────────────────────────────────
    await cartRepository.addItem(cart.id, productId, quantity);

    // Return the full updated cart (not just the item)
    return this.getCart(userId);
  }

  /**
   * Update the quantity of a cart item.
   *
   * Business rules:
   *   1. Cart item must exist and belong to the user
   *   2. New quantity must not exceed available stock
   *   3. Quantity must be >= 1 (use removeItem to delete)
   *
   * @param userId - Current user's ID (for ownership check)
   * @param itemId - CartItem UUID to update
   * @param quantity - New absolute quantity
   * @returns Updated cart with totals
   */
  async updateItem(userId: string, itemId: string, quantity: number) {
    // ── Verify ownership ──────────────────────────────────────────────
    const item = await cartRepository.findItemById(itemId);

    if (!item) {
      throw new NotFoundError('CartItem', itemId);
    }

    // Ensure the item belongs to this user's cart
    if (item.cart.userId !== userId) {
      throw new NotFoundError('CartItem', itemId);
    }

    // ── Check stock ──────────────────────────────────────────────────
    if (quantity > item.product.stock) {
      throw new BadRequestError(
        `Insufficient stock for "${item.product.name}". ` +
        `Available: ${item.product.stock}, requested: ${quantity}`,
      );
    }

    // ── Update ──────────────────────────────────────────────────────
    await cartRepository.updateItemQuantity(itemId, quantity);
    return this.getCart(userId);
  }

  /**
   * Remove a specific item from the cart.
   *
   * @param userId - Current user's ID (for ownership check)
   * @param itemId - CartItem UUID to remove
   * @returns Updated cart with totals
   */
  async removeItem(userId: string, itemId: string) {
    // ── Verify ownership ──────────────────────────────────────────────
    const item = await cartRepository.findItemById(itemId);

    if (!item) {
      throw new NotFoundError('CartItem', itemId);
    }

    if (item.cart.userId !== userId) {
      throw new NotFoundError('CartItem', itemId);
    }

    // ── Remove ─────────────────────────────────────────────────────
    await cartRepository.removeItem(itemId);
    return this.getCart(userId);
  }

  /**
   * Clear all items from the cart. The cart record stays — only items
   * are removed. This is used after checkout and for explicit "clear cart".
   *
   * @param userId - Current user's ID
   * @returns Empty cart with zeroed totals
   */
  async clearCart(userId: string) {
    const cart = await cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundError('Cart', userId, 'userId');
    }

    await cartRepository.clearItems(cart.id);
    return this.getCart(userId);
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const cartService = new CartService();

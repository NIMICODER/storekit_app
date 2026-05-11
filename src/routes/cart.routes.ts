// ── src/routes/cart.routes.ts ── Cart Route Definitions ───────────────
//
// All cart routes require authentication — you must be logged in to
// manage your cart. No admin-only routes here; every user gets a cart.
//
// ROUTE STRUCTURE:
//   GET    /cart              → Get my cart (with items and totals)
//   POST   /cart/items        → Add a product to cart
//   PATCH  /cart/items/:itemId → Update quantity of a cart item
//   DELETE /cart/items/:itemId → Remove a specific item from cart
//   DELETE /cart              → Clear entire cart
//
// .NET COMPARISON:
//   [Authorize]
//   [ApiController]
//   [Route("api/v1/[controller]")]
//   public class CartController : ControllerBase
//   {
//     [HttpGet]
//     public Task<IActionResult> GetCart() { ... }
//
//     [HttpPost("items")]
//     public Task<IActionResult> AddItem([FromBody] AddToCartRequest req) { ... }
//   }

import { Router } from 'express';
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} from '../controllers/cart.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  addToCartSchema,
  updateCartItemSchema,
  itemIdParamSchema,
} from '../validators/cart.validator';

const router = Router();

// ── All cart routes require authentication ────────────────────────────
// In C#, this is like putting [Authorize] on the controller class.
router.use(authenticate);

// ── Route Definitions ────────────────────────────────────────────────

/**
 * @openapi
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get the current user's cart
 *     description: Returns the cart with all items, product details, and computed totals. Creates an empty cart if none exists (lazy creation).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart with items and totals
 *       401:
 *         description: Not authenticated
 */
// Get the user's cart with all items, prices, and totals
router.get('/', getCart);

/**
 * @openapi
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Add a product to the cart
 *     description: Adds a product to the cart. If the product is already in the cart, increments the quantity. Validates stock availability.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *                 description: Product to add
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *     responses:
 *       200:
 *         description: Item added to cart
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found
 */
// Add a product to the cart (or increment quantity if already in cart)
router.post(
  '/items',
  validate({ body: addToCartSchema }),
  addItem,
);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Update cart item quantity
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Cart item UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 5
 *     responses:
 *       200:
 *         description: Cart item quantity updated
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Cart item not found
 */
// Update quantity of a specific cart item
router.patch(
  '/items/:itemId',
  validate({ params: itemIdParamSchema, body: updateCartItemSchema }),
  updateItem,
);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove an item from the cart
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Item removed from cart
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Cart item not found
 */
// Remove a specific item from the cart
router.delete(
  '/items/:itemId',
  validate({ params: itemIdParamSchema }),
  removeItem,
);

/**
 * @openapi
 * /cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear the entire cart
 *     description: Removes all items from the cart but keeps the cart itself.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 *       401:
 *         description: Not authenticated
 */
// Clear all items from the cart
router.delete('/', clearCart);

export default router;

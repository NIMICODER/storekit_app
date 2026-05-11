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

// Get the user's cart with all items, prices, and totals
router.get('/', getCart);

// Add a product to the cart (or increment quantity if already in cart)
router.post(
  '/items',
  validate({ body: addToCartSchema }),
  addItem,
);

// Update quantity of a specific cart item
router.patch(
  '/items/:itemId',
  validate({ params: itemIdParamSchema, body: updateCartItemSchema }),
  updateItem,
);

// Remove a specific item from the cart
router.delete(
  '/items/:itemId',
  validate({ params: itemIdParamSchema }),
  removeItem,
);

// Clear all items from the cart
router.delete('/', clearCart);

export default router;

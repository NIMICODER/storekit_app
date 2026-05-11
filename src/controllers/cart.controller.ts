// ── src/controllers/cart.controller.ts ── Cart HTTP Handlers ──────────
//
// Thin controller layer — validates input (via middleware), calls the
// service, and sends the response. No business logic here.
//
// All cart endpoints require authentication (user must be logged in).
// The user's ID comes from req.user (set by authenticate middleware).
//
// .NET COMPARISON:
//   [Authorize]
//   [ApiController]
//   [Route("api/v1/cart")]
//   public class CartController : ControllerBase
//   {
//     [HttpGet]
//     public async Task<IActionResult> GetCart() { ... }
//   }

import { Request, Response } from 'express';
import { cartService } from '../services/cart.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';

// ── Get Cart ──────────────────────────────────────────────────────────

/** GET /api/v1/cart — Get the user's cart with items and totals. */
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await cartService.getCart(req.user!.userId);
  sendSuccess(res, cart);
});

// ── Add Item ──────────────────────────────────────────────────────────

/** POST /api/v1/cart/items — Add a product to the cart. */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId, quantity } = req.body;
  const cart = await cartService.addItem(req.user!.userId, productId, quantity);
  sendSuccess(res, cart, 'Item added to cart');
});

// ── Update Item ───────────────────────────────────────────────────────

/** PATCH /api/v1/cart/items/:itemId — Update quantity of a cart item. */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  const cart = await cartService.updateItem(req.user!.userId, itemId, quantity);
  sendSuccess(res, cart, 'Cart item updated');
});

// ── Remove Item ───────────────────────────────────────────────────────

/** DELETE /api/v1/cart/items/:itemId — Remove a specific item from cart. */
export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const cart = await cartService.removeItem(req.user!.userId, itemId);
  sendSuccess(res, cart, 'Item removed from cart');
});

// ── Clear Cart ────────────────────────────────────────────────────────

/** DELETE /api/v1/cart — Clear all items from the cart. */
export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await cartService.clearCart(req.user!.userId);
  sendSuccess(res, cart, 'Cart cleared');
});

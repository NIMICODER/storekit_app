// ── src/controllers/order.controller.ts ── Order HTTP Handlers ────────
//
// Handles checkout, order history, order detail, and admin status updates.
//
// All endpoints require authentication. The checkout endpoint creates
// an order from the user's cart — it's the most important endpoint in
// the entire API.
//
// .NET COMPARISON:
//   [Authorize]
//   [ApiController]
//   [Route("api/v1/orders")]
//   public class OrdersController : ControllerBase
//   {
//     [HttpPost("checkout")]
//     public async Task<IActionResult> Checkout([FromBody] CheckoutRequest request) { ... }
//   }

import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPaginationMeta } from '../utils/apiResponse';

// ── Checkout ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/orders/checkout
 *
 * Convert the user's cart into an order. This is the "buy now" action.
 * Returns the created order + payment info (with mock payment URL in dev).
 */
export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const { shippingAddress, billingAddress, notes } = req.body;

  const result = await orderService.checkout({
    userId: req.user!.userId,
    shippingAddress,
    billingAddress,
    notes,
  });

  sendCreated(res, result, 'Order created successfully');
});

// ── Get My Orders ────────────────────────────────────────────────────

/**
 * GET /api/v1/orders
 *
 * Get the current user's order history with pagination.
 * Admins see all orders; regular users see only their own.
 */
export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, status } = req.query as unknown as {
    page: number;
    limit: number;
    status?: string;
  };

  const isAdmin = req.user!.role === 'ADMIN';

  // Admins see all orders (optionally filtered by status)
  // Regular users see only their own
  if (isAdmin) {
    const result = await orderService.getAllOrders(page, limit, status);
    const meta = buildPaginationMeta(result.pagination.total, page, limit);
    sendPaginated(res, result.orders, meta);
  } else {
    const result = await orderService.getMyOrders(req.user!.userId, page, limit);
    const meta = buildPaginationMeta(result.pagination.total, page, limit);
    sendPaginated(res, result.orders, meta);
  }
});

// ── Get Order By ID ──────────────────────────────────────────────────

/**
 * GET /api/v1/orders/:id
 *
 * Get a specific order's full details (items, payment, user).
 * Regular users can only see their own orders; admins can see any.
 */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const order = await orderService.getOrderById(
    req.params.id,
    req.user!.userId,
    isAdmin,
  );

  sendSuccess(res, order);
});

// ── Update Order Status (Admin) ──────────────────────────────────────

/**
 * PATCH /api/v1/orders/:id/status
 *
 * Admin-only: Update an order's status (e.g. CONFIRMED → PROCESSING).
 * Triggers a status update notification email to the customer.
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  const order = await orderService.updateOrderStatus(req.params.id, status);
  sendSuccess(res, order, `Order status updated to ${status}`);
});

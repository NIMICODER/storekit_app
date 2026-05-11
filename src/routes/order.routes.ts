// ── src/routes/order.routes.ts ── Order Route Definitions ─────────────
//
// Order endpoints: checkout, order history, order detail, admin status update.
//
// ROUTE STRUCTURE:
//   POST  /orders/checkout    → Create order from cart (auth required)
//   GET   /orders             → My order history (auth required; admin sees all)
//   GET   /orders/:id         → Order detail (auth required; own orders or admin)
//   PATCH /orders/:id/status  → Update status (admin only)
//
// AUTHENTICATION vs AUTHORIZATION:
//   - `authenticate` = "Are you logged in?" (has valid JWT)
//   - `authorize('ADMIN')` = "Do you have permission?" (role check)
//   - All routes need authentication. Status update also needs admin role.
//
// .NET COMPARISON:
//   [Authorize]
//   [Route("api/v1/orders")]
//   public class OrdersController : ControllerBase
//   {
//     [HttpPost("checkout")]
//     public Task<IActionResult> Checkout() { ... }
//
//     [HttpPatch("{id}/status")]
//     [Authorize(Roles = "ADMIN")]
//     public Task<IActionResult> UpdateStatus(string id) { ... }
//   }

import { Router } from 'express';
import {
  checkout,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
} from '../controllers/order.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.validator';
import {
  checkoutSchema,
  updateOrderStatusSchema,
  getOrdersQuerySchema,
} from '../validators/order.validator';

const router = Router();

// ── All order routes require authentication ──────────────────────────
router.use(authenticate);

// ── Route Definitions ────────────────────────────────────────────────

// Checkout: convert cart → order (the "buy" action)
router.post(
  '/checkout',
  validate({ body: checkoutSchema }),
  checkout,
);

// Get order history (users see their own; admins see all)
router.get(
  '/',
  validate({ query: getOrdersQuerySchema }),
  getMyOrders,
);

// Get a specific order by ID
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  getOrderById,
);

// Admin: update order status (e.g. CONFIRMED → SHIPPING)
router.patch(
  '/:id/status',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  updateOrderStatus,
);

export default router;

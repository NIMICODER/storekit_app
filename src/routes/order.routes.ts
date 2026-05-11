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
import { strictLimiter } from '../middleware/rateLimiter';
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

/**
 * @openapi
 * /orders/checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Checkout — convert cart into an order
 *     description: |
 *       Atomically creates an order from the current cart contents.
 *       Verifies stock, creates order + items, creates payment record,
 *       decrements stock, and clears the cart — all in a single transaction.
 *       Fires order.created and payment events for async processing.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddress]
 *             properties:
 *               shippingAddress:
 *                 type: object
 *                 required: [street, city, state, zip, country]
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: 123 Main St
 *                   city:
 *                     type: string
 *                     example: Portland
 *                   state:
 *                     type: string
 *                     example: OR
 *                   zip:
 *                     type: string
 *                     example: "97201"
 *                   country:
 *                     type: string
 *                     example: US
 *               notes:
 *                 type: string
 *                 example: Please leave at front door
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Cart is empty or insufficient stock
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Too many requests — rate limited
 */
// Checkout: convert cart → order (the "buy" action)
router.post(
  '/checkout',
  strictLimiter,
  validate({ body: checkoutSchema }),
  checkout,
);

/**
 * @openapi
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get order history
 *     description: Users see their own orders. Admins see all orders.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated order list
 *       401:
 *         description: Not authenticated
 */
// Get order history (users see their own; admins see all)
router.get(
  '/',
  validate({ query: getOrdersQuerySchema }),
  getMyOrders,
);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 *     description: Returns full order details including items with price snapshots. Users can only view their own orders; admins can view any.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order details with items
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found
 */
// Get a specific order by ID
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  getOrderById,
);

/**
 * @openapi
 * /orders/{id}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: Update order status (ADMIN only)
 *     description: |
 *       Validates status transitions: PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED.
 *       CANCELLED is allowed from PENDING or CONFIRMED only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *                 example: CONFIRMED
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (requires ADMIN role)
 *       404:
 *         description: Order not found
 */
// Admin: update order status (e.g. CONFIRMED → SHIPPING)
router.patch(
  '/:id/status',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  updateOrderStatus,
);

export default router;

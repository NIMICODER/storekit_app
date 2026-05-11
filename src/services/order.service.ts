// ── src/services/order.service.ts ── Order Business Logic ─────────────
//
// Manages the order lifecycle: checkout (cart → order), order history,
// and admin status updates. Checkout is the most complex operation in
// the entire API — it runs inside a Prisma transaction to ensure
// atomicity (all-or-nothing).
//
// CHECKOUT FLOW (inside $transaction):
//   1. Validate cart exists and has items
//   2. Verify all products are still in stock and active
//   3. Generate order number (ORD-00001, ORD-00002, etc.)
//   4. Create Order with snapshot of cart items → OrderItems
//   5. Create Payment record (PENDING status)
//   6. Decrement product stock for each item
//   7. Clear cart items
//   8. Emit 'order.created' event → triggers email + stock check
//   9. Return order with mock payment info
//
// WHY A TRANSACTION?
//   Imagine: you decrement stock but the order insert fails — now you've
//   "lost" stock that no order claims. Or: the order succeeds but stock
//   decrement fails — you've oversold. A transaction ensures ALL steps
//   succeed or ALL roll back. This is the #1 most important data integrity
//   pattern in e-commerce.
//
// .NET/EF CORE COMPARISON:
//   using var transaction = await dbContext.Database.BeginTransactionAsync();
//   try {
//     dbContext.Orders.Add(order);
//     await dbContext.SaveChangesAsync();
//     await transaction.CommitAsync();
//   } catch {
//     await transaction.RollbackAsync();
//     throw;
//   }
//
//   Prisma's $transaction() does the same — wraps multiple operations in
//   a single DB transaction with automatic rollback on error.

import prisma from '../config/database';
import { orderRepository } from '../repositories/order.repository';
import { cartRepository } from '../repositories/cart.repository';
import { NotFoundError, BadRequestError } from '../errors';
import { eventBus, EVENT_NAMES } from '../events';
import { env } from '../config/env';
import type { Prisma } from '../generated/prisma/client';

// ── Types ────────────────────────────────────────────────────────────

interface CheckoutInput {
  userId: string;
  shippingAddress: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  notes?: string;
}

// ── Order Service Class ──────────────────────────────────────────────

class OrderService {
  /**
   * CHECKOUT — Convert a cart into an order.
   *
   * This is the most critical operation in the API. It runs inside a
   * database transaction to ensure atomicity.
   *
   * @param input - User ID, shipping address, optional billing address and notes
   * @returns Created order with items, payment info, and mock payment URL
   * @throws BadRequestError if cart is empty or products are out of stock
   */
  async checkout(input: CheckoutInput) {
    const { userId, shippingAddress, billingAddress, notes } = input;

    // ── Step 1: Validate cart ──────────────────────────────────────────
    const cart = await cartRepository.findForCheckout(userId);

    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('Your cart is empty. Add items before checkout.');
    }

    // ── Step 2: Run checkout inside a transaction ──────────────────────
    // Everything from stock check to cart clearing happens atomically.
    // If any step fails, ALL changes are rolled back.

    const result = await prisma.$transaction(async (tx) => {
      // ── 2a: Verify stock for all items ──────────────────────────────
      // Re-read products inside the transaction for consistency.
      // In a high-traffic system, you'd use SELECT ... FOR UPDATE (row locks).
      // Prisma doesn't support FOR UPDATE directly, but the transaction
      // provides serialisation for these reads.

      for (const item of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, stock: true, isActive: true, deletedAt: true },
        });

        if (!product || !product.isActive || product.deletedAt) {
          throw new BadRequestError(
            `Product "${item.product.name}" is no longer available. Please remove it from your cart.`,
          );
        }

        if (product.stock < item.quantity) {
          throw new BadRequestError(
            `Insufficient stock for "${product.name}". ` +
            `Available: ${product.stock}, in cart: ${item.quantity}`,
          );
        }
      }

      // ── 2b: Calculate totals ────────────────────────────────────────
      let subtotal = 0;
      for (const item of cart.items) {
        const lineTotal = Number(item.product.price) * item.quantity;
        subtotal += lineTotal;
      }
      // Round to 2 decimal places to avoid floating-point drift
      subtotal = Math.round(subtotal * 100) / 100;

      // For now: no tax, no shipping, no discount.
      // These would be calculated here in a full implementation.
      const total = subtotal;

      // ── 2c: Generate order number ───────────────────────────────────
      const orderNumber = await orderRepository.generateOrderNumber();

      // ── 2d: Create order with items (snapshot pattern) ──────────────
      // OrderItems capture the product name and price AT THIS MOMENT.
      // Even if the product price changes tomorrow, this order keeps
      // the price the customer agreed to.
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: 'PENDING',
          subtotal,
          total,
          tax: 0,
          shippingCost: 0,
          discount: 0,
          shippingAddress: shippingAddress as Prisma.InputJsonValue,
          billingAddress: billingAddress
            ? (billingAddress as Prisma.InputJsonValue)
            : undefined,
          notes: notes ?? null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: Number(item.product.price),
              totalPrice: Math.round(Number(item.product.price) * item.quantity * 100) / 100,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // ── 2e: Create payment record (PENDING) ────────────────────────
      // In a real system, you'd call Stripe/Paystack here to get a
      // payment intent ID. For dev, we generate a mock ID.
      const mockPaymentId = `mock_pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: total,
          currency: 'USD',
          provider: env.isDevelopment ? 'mock' : 'paystack',
          providerPaymentId: mockPaymentId,
          status: 'PENDING',
        },
      });

      // ── 2f: Decrement stock for each item ──────────────────────────
      // Atomic decrement: uses Prisma's { decrement: N } operator.
      // This is translated to: UPDATE products SET stock = stock - N WHERE id = ?
      // Safe for concurrent requests (no read-modify-write race condition).
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // ── 2g: Clear cart items ────────────────────────────────────────
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return { order, payment, mockPaymentId };
    });

    // ── Step 3: Emit order.created event (outside transaction) ────────
    // We emit AFTER the transaction commits — if it rolled back, we
    // don't want to send confirmation emails for orders that don't exist.
    //
    // In C#: await _mediator.Publish(new OrderCreatedEvent { ... });

    const userInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    eventBus.emit(EVENT_NAMES.ORDER_CREATED, {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      userId,
      customerEmail: userInfo?.email ?? '',
      customerName: `${userInfo?.firstName ?? ''} ${userInfo?.lastName ?? ''}`.trim(),
      orderTotal: Number(result.order.total),
      itemCount: cart.items.length,
      productIds: cart.items.map((item) => item.productId),
    });

    // ── Step 4: Return order with payment info ────────────────────────
    // In dev mode, include a "simulate payment" hint so the developer
    // knows how to trigger the webhook.
    const fullOrder = await orderRepository.findById(result.order.id);

    return {
      order: fullOrder,
      payment: {
        id: result.payment.id,
        provider: result.payment.provider,
        providerPaymentId: result.mockPaymentId,
        status: result.payment.status,
        amount: Number(result.payment.amount),
        currency: result.payment.currency,
        // In a real system, this would be a Paystack/Stripe checkout URL
        paymentUrl: env.isDevelopment
          ? `POST /api/${env.apiVersion}/webhooks/payment/simulate with { "orderId": "${result.order.id}" }`
          : `https://checkout.paystack.com/${result.mockPaymentId}`,
      },
    };
  }

  /**
   * Get order history for the current user.
   *
   * @param userId - Current user's ID
   * @param page - Page number (1-based)
   * @param limit - Items per page
   * @returns Paginated orders with items and payment info
   */
  async getMyOrders(userId: string, page: number = 1, limit: number = 10) {
    const { orders, total } = await orderRepository.findByUserId(userId, page, limit);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a specific order by ID. Users can only see their own orders;
   * admins can see any order.
   *
   * @param orderId - Order UUID
   * @param userId - Current user's ID
   * @param isAdmin - Whether the user has admin role
   * @throws NotFoundError if order doesn't exist or doesn't belong to user
   */
  async getOrderById(orderId: string, userId: string, isAdmin: boolean) {
    const order = await orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // Non-admin users can only see their own orders
    if (!isAdmin && order.userId !== userId) {
      throw new NotFoundError('Order', orderId);
    }

    return order;
  }

  /**
   * Update order status (admin-only action).
   *
   * Validates the status transition and emits an event for notification.
   *
   * @param orderId - Order UUID
   * @param newStatus - Target status
   * @returns Updated order
   * @throws NotFoundError if order doesn't exist
   * @throws BadRequestError if status transition is invalid
   */
  async updateOrderStatus(orderId: string, newStatus: string) {
    const order = await orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // ── Validate status transitions ──────────────────────────────────
    // Not all transitions are valid. E.g., you can't go from DELIVERED back to PENDING.
    const validTransitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: [], // Terminal state — no further transitions
      CANCELLED: [], // Terminal state
    };

    const allowedNext = validTransitions[order.status] ?? [];
    if (!allowedNext.includes(newStatus)) {
      throw new BadRequestError(
        `Cannot transition order from ${order.status} to ${newStatus}. ` +
        `Allowed: ${allowedNext.length > 0 ? allowedNext.join(', ') : 'none (terminal state)'}`,
      );
    }

    // ── Update status ────────────────────────────────────────────────
    const updatedOrder = await orderRepository.updateStatus(orderId, newStatus);

    // ── Emit event ──────────────────────────────────────────────────
    eventBus.emit(EVENT_NAMES.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      customerEmail: order.user.email,
      customerName: `${order.user.firstName} ${order.user.lastName}`,
      oldStatus: order.status,
      newStatus,
    });

    return updatedOrder;
  }

  /**
   * Get all orders (admin view) with optional status filter.
   */
  async getAllOrders(page: number = 1, limit: number = 10, status?: string) {
    const { orders, total } = await orderRepository.findAll(page, limit, status);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const orderService = new OrderService();

// ── src/repositories/order.repository.ts ── Order Data Access ─────────
//
// CRUD operations for orders. Orders are IMMUTABLE snapshots — once
// created, the items and prices never change (even if the product's
// price changes later). Only the `status` field is mutable.
//
// KEY DESIGN:
//   - Orders are created inside a Prisma transaction (in the service layer)
//   - This repository provides the building blocks; the service composes them
//   - Order items capture price AT TIME OF PURCHASE (snapshot pattern)
//   - Order number is auto-generated: ORD-00001, ORD-00002, etc.
//
// .NET/EF CORE COMPARISON:
//   public class OrderRepository : IOrderRepository
//   {
//     Task<Order> CreateAsync(Order order);
//     Task<IPagedList<Order>> GetByUserIdAsync(string userId, int page, int size);
//     Task UpdateStatusAsync(string orderId, OrderStatus status);
//   }

import prisma from '../config/database';

// ── Shared include clauses ────────────────────────────────────────────

const ORDER_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          images: true,
        },
      },
    },
  },
  payment: true,
  user: {
    // Include user info but never the password
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

// ── Order Repository Class ───────────────────────────────────────────

class OrderRepository {
  /**
   * Generate the next order number (ORD-00001, ORD-00002, etc.).
   *
   * Queries the most recent order number and increments it. If no orders
   * exist yet, starts at ORD-00001. Falls back to timestamp-based if
   * there's a conflict (shouldn't happen, but defensive coding).
   *
   * In a high-traffic system, you'd use a database sequence instead.
   * For StoreKit, this simple approach works fine.
   *
   * In C#: would use a database sequence or EF Core ValueGenerator.
   */
  async generateOrderNumber(): Promise<string> {
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    if (!lastOrder) {
      return 'ORD-00001';
    }

    // Extract the numeric part: "ORD-00042" → 42
    const match = lastOrder.orderNumber.match(/ORD-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `ORD-${String(nextNum).padStart(5, '0')}`;
    }

    // Fallback: timestamp-based (shouldn't happen unless data is corrupted)
    return `ORD-${Date.now()}`;
  }

  /**
   * Find an order by ID with all related data (items, payment, user).
   */
  async findById(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
  }

  /**
   * Find all orders for a specific user with pagination.
   * Orders are sorted newest-first (most recent orders at the top).
   *
   * @returns { orders, total } for pagination metadata
   */
  async findByUserId(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { userId } }),
    ]);

    return { orders, total };
  }

  /**
   * Find all orders (admin view) with optional status filter.
   */
  async findAll(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  /**
   * Update order status (admin action).
   * Only the status field is mutable after creation.
   */
  async updateStatus(orderId: string, status: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { status: status as 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' },
      include: ORDER_INCLUDE,
    });
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const orderRepository = new OrderRepository();

// ── src/repositories/payment.repository.ts ── Payment Data Access ─────
//
// CRUD operations for the Payment model. Each order has exactly one
// payment record (1:1 relationship, enforced by unique orderId).
//
// Payment records track:
//   1. The amount and currency
//   2. The payment provider (e.g. "paystack", "stripe", "mock")
//   3. The provider's payment ID (for reconciliation)
//   4. Status: PENDING → COMPLETED or FAILED
//   5. Raw metadata from the provider (webhook data)
//
// .NET COMPARISON:
//   public class PaymentRepository : IPaymentRepository
//   {
//     Task<Payment> CreateAsync(Payment payment);
//     Task<Payment?> GetByOrderIdAsync(string orderId);
//     Task<Payment?> GetByProviderPaymentIdAsync(string providerId);
//     Task UpdateStatusAsync(string paymentId, PaymentStatus status, object? metadata);
//   }

import prisma from '../config/database';
import type { Prisma } from '../generated/prisma/client';

// ── Payment Repository Class ──────────────────────────────────────────

class PaymentRepository {
  /**
   * Create a new payment record linked to an order.
   *
   * Called during checkout when the order is created. The payment starts
   * as PENDING — it transitions to COMPLETED or FAILED when the payment
   * provider sends a webhook callback.
   */
  async create(data: {
    orderId: string;
    amount: number;
    currency?: string;
    provider: string;
    providerPaymentId: string;
  }) {
    return prisma.payment.create({
      data: {
        orderId: data.orderId,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
        status: 'PENDING',
      },
    });
  }

  /**
   * Find payment by order ID. Used to check payment status for an order.
   */
  async findByOrderId(orderId: string) {
    return prisma.payment.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            userId: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  /**
   * Find payment by the provider's payment ID.
   * Used during webhook processing — the provider sends their ID, we
   * look up which of our payments it corresponds to.
   *
   * In C#: dbContext.Payments.FirstOrDefaultAsync(p => p.ProviderPaymentId == id)
   */
  async findByProviderPaymentId(providerPaymentId: string) {
    return prisma.payment.findFirst({
      where: { providerPaymentId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            userId: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  /**
   * Update payment status after webhook processing.
   *
   * @param paymentId - Our internal payment UUID
   * @param status - New status (COMPLETED, FAILED, REFUNDED)
   * @param metadata - Raw webhook data from the provider (for audit)
   */
  async updateStatus(
    paymentId: string,
    status: 'COMPLETED' | 'FAILED' | 'REFUNDED',
    metadata?: Prisma.InputJsonValue,
  ) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        metadata,
        // Set paidAt timestamp when payment completes
        ...(status === 'COMPLETED' ? { paidAt: new Date() } : {}),
      },
    });
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const paymentRepository = new PaymentRepository();

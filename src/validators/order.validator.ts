// ── src/validators/order.validator.ts ── Order Zod Schemas ────────────
//
// Validation schemas for order-related endpoints: checkout, status
// updates, and order listing query params.
//
// CHECKOUT VALIDATION:
//   The shippingAddress is a JSON object with flexible structure. We
//   validate that it's a non-empty object, but don't enforce specific
//   address fields (street, city, zip) — different countries have
//   different address formats.
//
//   In a production system, you'd validate against a specific schema
//   per country or use a third-party address validation API.

import { z } from 'zod';
import { paginationSchema } from './common.validator';

// ── Checkout Schema ──────────────────────────────────────────────────

/** POST /api/v1/orders/checkout — Create order from cart. */
export const checkoutSchema = z.object({
  // Shipping address is a flexible JSON object — different countries have
  // different address formats, so we accept any non-empty object.
  // In a production system, you'd validate specific fields per country.
  shippingAddress: z
    .record(z.string(), z.unknown())
    .refine(
      (addr) => Object.keys(addr).length > 0,
      'Shipping address cannot be empty',
    ),

  billingAddress: z
    .record(z.string(), z.unknown())
    .refine(
      (addr) => Object.keys(addr).length > 0,
      'Billing address cannot be empty if provided',
    )
    .optional(),

  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional(),
});

// ── Update Order Status Schema ────────────────────────────────────────

// Restrict to valid OrderStatus values — matches the Prisma enum.
// In C#: public enum OrderStatus { PENDING, CONFIRMED, ... }
const validOrderStatuses = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED',
] as const;

/** PATCH /api/v1/orders/:id/status — Admin updates order status. */
export const updateOrderStatusSchema = z.object({
  status: z.enum(validOrderStatuses, {
    error: `Status must be one of: ${validOrderStatuses.join(', ')}`,
  }),
});

// ── Get Orders Query Schema ──────────────────────────────────────────

/** GET /api/v1/orders — Query params for order listing. */
export const getOrdersQuerySchema = paginationSchema.extend({
  status: z.enum(validOrderStatuses).optional(),
});

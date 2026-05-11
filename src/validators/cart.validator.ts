// ── src/validators/cart.validator.ts ── Cart Zod Schemas ──────────────
//
// Validation schemas for cart-related endpoints.
//
// .NET COMPARISON:
//   In C#, you'd use FluentValidation or Data Annotations:
//     public class AddToCartValidator : AbstractValidator<AddToCartRequest>
//     {
//       public AddToCartValidator()
//       {
//         RuleFor(x => x.ProductId).NotEmpty().Must(BeAValidGuid);
//         RuleFor(x => x.Quantity).GreaterThanOrEqualTo(1);
//       }
//     }
//
//   Zod does the same thing with a builder pattern. The key difference:
//   Zod validates at runtime AND infers TypeScript types at compile time.
//   FluentValidation only validates at runtime — you write the DTO class
//   separately.

import { z } from 'zod';

// ── Add to Cart ──────────────────────────────────────────────────────

/** POST /api/v1/cart/items — Add a product to the cart. */
export const addToCartSchema = z.object({
  productId: z
    .string({ error: 'Product ID is required' })
    .uuid('Product ID must be a valid UUID'),

  quantity: z
    .number({ error: 'Quantity is required and must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(100, 'Cannot add more than 100 of one item'),
});

// ── Update Cart Item ──────────────────────────────────────────────────

/** PATCH /api/v1/cart/items/:itemId — Update quantity of a cart item. */
export const updateCartItemSchema = z.object({
  quantity: z
    .number({ error: 'Quantity is required and must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1 (use DELETE to remove)')
    .max(100, 'Cannot have more than 100 of one item'),
});

// ── Item ID Param ────────────────────────────────────────────────────

/** Validates :itemId route parameter as a UUID. */
export const itemIdParamSchema = z.object({
  itemId: z.string().uuid('Invalid UUID format for itemId parameter'),
});

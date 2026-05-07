// src/validators/user.validator.ts — User Zod Schemas

import { z } from 'zod';
import { paginationSchema } from './common.validator';

// ── Update User Profile Schema ───────────────────────────────────────────────

/** PUT /api/v1/users/:id — safe profile fields only (not email/password/role). */
export const updateUserProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(100, 'First name cannot exceed 100 characters')
    .optional(),

  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(100, 'Last name cannot exceed 100 characters')
    .optional(),

  phone: z
    .string()
    .max(20, 'Phone number cannot exceed 20 characters')
    .optional()
    .nullable(),

  // Stored as Prisma Json type
  address: z.any().optional(),
});

// ── Get Users Query Schema ───────────────────────────────────────────────────

/** GET /api/v1/users — pagination + role filter + text search. */
export const getUsersQuerySchema = paginationSchema.merge(
  z.object({
    role: z
      .enum(['ADMIN', 'CUSTOMER'], { error: 'Role must be ADMIN or CUSTOMER' })
      .optional(),

    search: z
      .string()
      .max(200, 'Search query cannot exceed 200 characters')
      .optional(),
  }),
);

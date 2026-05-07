/**
 * src/validators/user.validator.ts — User Zod Schemas
 *
 * PURPOSE:
 *   Defines Zod schemas for user-related requests:
 *     - updateUserProfileSchema → PUT /users/:id body
 *     - getUsersQuerySchema     → GET /users query params
 *
 * NOTE:
 *   No createUserSchema here — user creation is handled by the Auth module
 *   (Phase 6) with its own registration schema (email, password, etc.).
 *
 * C# EQUIVALENT:
 *   public class UpdateProfileDto {
 *     [StringLength(100)]
 *     public string? FirstName { get; set; }
 *
 *     [StringLength(100)]
 *     public string? LastName { get; set; }
 *
 *     [Phone]
 *     public string? Phone { get; set; }
 *
 *     public JsonElement? Address { get; set; }
 *   }
 */

import { z } from 'zod';
import { paginationSchema } from './common.validator';

// ─────────────────────────────────────────────────────────────────────────────
// Update User Profile Schema — PUT /api/v1/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the request body for updating a user's profile.
 *
 * Only allows updating safe profile fields:
 *   firstName, lastName, phone, address
 *
 * Does NOT allow: email, password, role
 * (Those require auth-related operations — Phase 6)
 */
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

  // Address is stored as JSON in the database (Prisma's Json type).
  // We accept any JSON-compatible value.
  address: z.any().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Get Users Query Schema — GET /api/v1/users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates query parameters for the user list endpoint.
 *
 * Extends pagination with user-specific filters:
 *   ?role=ADMIN       → filter by role
 *   ?search=john      → search in name/email
 *
 * z.enum() restricts values to a specific set — like C#'s enum:
 *   enum UserRole { ADMIN, CUSTOMER }
 */
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

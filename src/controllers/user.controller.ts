/**
 * src/controllers/user.controller.ts — User HTTP Controller
 *
 * PURPOSE:
 *   Handles HTTP requests for user endpoints.
 *   Limited to READ + profile UPDATE (no registration/login — Phase 6).
 *
 * OPERATIONS:
 *   GET  /api/v1/users      → List users (admin, paginated)
 *   GET  /api/v1/users/:id  → Get single user
 *   PUT  /api/v1/users/:id  → Update user profile
 *
 * PHASE 5 CHANGES:
 *   - asyncHandler wraps all handlers (no try/catch)
 *   - Zod validate() middleware validates input before handlers run
 *   - Services throw NotFoundError → global errorHandler formats response
 *
 * SECURITY NOTE:
 *   All responses exclude the password field.
 *   Phase 6 will add authentication middleware to protect these routes.
 *
 * C# EQUIVALENT:
 *   [ApiController]
 *   [Route("api/v1/users")]
 *   [Authorize]  // ← Phase 6 adds this
 *   public class UserController : ControllerBase { ... }
 */

import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  sendSuccess,
  sendPaginated,
  buildPaginationMeta,
} from '../utils/apiResponse';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a paginated list of users.
 *
 * Query parameters (validated + coerced by Zod):
 *   ?page=1        - Page number (default: 1)
 *   ?limit=10      - Users per page (default: 10)
 *   ?role=ADMIN    - Filter by role (ADMIN or CUSTOMER)
 *   ?search=john   - Search in name/email
 *
 * This endpoint will be restricted to ADMIN role in Phase 6.
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  // Cast through unknown — Zod replaced ParsedQs with typed values
  const { page, limit, role, search } = req.query as unknown as {
    page: number;
    limit: number;
    role?: string;
    search?: string;
  };

  const { users, total } = await userService.getUsers({
    page,
    limit,
    role,
    search,
  });

  const meta = buildPaginationMeta(total, page, limit);
  sendPaginated(res, users, meta);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single user by ID (without password).
 *
 * Phase 6 will restrict: user can only view their OWN profile,
 * unless they're an admin.
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, user);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update a user's profile.
 *
 * Only allows updating profile fields (validated by Zod):
 *   - firstName, lastName, phone, address
 *
 * Does NOT allow: email, password, role changes.
 * The Zod schema only accepts the allowed fields — anything else is stripped.
 *
 * Before Phase 5, the controller manually extracted allowed fields:
 *   const { firstName, lastName, phone, address } = req.body;
 *
 * After Phase 5, Zod's updateUserProfileSchema only permits those fields,
 * so req.body already contains ONLY the allowed data.
 */
export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUserProfile(req.params.id, req.body);
  sendSuccess(res, user, 'Profile updated successfully');
});

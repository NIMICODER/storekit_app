/**
 * src/routes/user.routes.ts — User Route Definitions
 *
 * PURPOSE:
 *   Maps HTTP methods + URL paths to user controller functions.
 *   Limited to READ + profile UPDATE (registration/login is in auth.routes.ts).
 *
 * SECURITY (Phase 6):
 * ───────────────────────────────────────────────────────────────────────────
 *   All user routes are now PROTECTED with authentication middleware.
 *   Additionally, GET /users (list all) requires the ADMIN role.
 *
 *   Middleware order on each route:
 *     authenticate → authorize? → validate → controller
 *
 *   This mirrors ASP.NET's [Authorize] + [Authorize(Roles = "ADMIN")] pattern.
 *
 * C# EQUIVALENT:
 *   [Route("api/v1/users")]
 *   [Authorize]  // all routes require authentication
 *   public class UserController : ControllerBase {
 *     [Authorize(Roles = "ADMIN")]
 *     [HttpGet]
 *     public async Task<IActionResult> GetAll() { ... }
 *   }
 */

import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUserProfile,
} from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { idParamSchema } from '../validators/common.validator';
import { updateUserProfileSchema, getUsersQuerySchema } from '../validators/user.validator';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions (with auth + validation middleware)
// ─────────────────────────────────────────────────────────────────────────────
//
// Middleware order: authenticate → authorize → validate → controller
//
// Why this order?
//   1. authenticate: Is this person logged in? (cheapest check — just verify JWT)
//   2. authorize: Do they have the right role? (simple string comparison)
//   3. validate: Is the request data valid? (Zod parsing — more expensive)
//   4. controller: Execute the actual business logic
//
// We don't waste time validating data from an unauthenticated/unauthorized user.

// GET /api/v1/users — List users (paginated, filterable by role/search)
// ADMIN ONLY — customers shouldn't see the full user list
// Middleware: authenticate → authorize('ADMIN') → validate query → controller
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ query: getUsersQuerySchema }),
  getUsers,
);

// GET /api/v1/users/:id — Get a single user by ID
// Any authenticated user can view a user profile
// Middleware: authenticate → validate params → controller
router.get(
  '/:id',
  authenticate,
  validate({ params: idParamSchema }),
  getUserById,
);

// PUT /api/v1/users/:id — Update user profile
// Any authenticated user can update (ownership check could be added later)
// Middleware: authenticate → validate params + body → controller
router.put(
  '/:id',
  authenticate,
  validate({ params: idParamSchema, body: updateUserProfileSchema }),
  updateUserProfile,
);

export default router;

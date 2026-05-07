/**
 * src/routes/auth.routes.ts — Authentication Route Definitions
 *
 * PURPOSE:
 *   Maps HTTP methods + URL paths to auth controller functions.
 *   Includes validation middleware for request bodies.
 *
 * ROUTE TABLE:
 * ───────────────────────────────────────────────────────────────────────────
 *   Method  Path       Auth?   Description
 *   POST    /register  No      Create new account
 *   POST    /login     No      Log in with email + password
 *   POST    /refresh   No      Exchange refresh token for new tokens
 *   POST    /logout    Yes     Client-side logout hint
 *   GET     /me        Yes     Get current user's profile
 *
 * PUBLIC vs PROTECTED:
 * ───────────────────────────────────────────────────────────────────────────
 *   Register, login, and refresh are PUBLIC — you can't require auth to
 *   log in (chicken-and-egg problem).
 *
 *   Logout and /me are PROTECTED — they require a valid access token.
 *   The authenticate middleware runs before the controller on these routes.
 *
 * MIDDLEWARE ORDER (for protected routes):
 *   authenticate → validate → controller
 *     │              │          │
 *     │              │          └─ Business logic
 *     │              └─ Validate request body/params
 *     └─ Verify JWT, set req.user
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   // In ASP.NET Core, you'd use [AllowAnonymous] and [Authorize]:
 *   [Route("api/v1/auth")]
 *   public class AuthController : ControllerBase {
 *     [AllowAnonymous]
 *     [HttpPost("register")]
 *     public async Task<IActionResult> Register(RegisterDto dto) { ... }
 *
 *     [Authorize]
 *     [HttpGet("me")]
 *     public async Task<IActionResult> GetMe() { ... }
 *   }
 */

import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public Routes (no authentication required)
// ─────────────────────────────────────────────────────────────────────────────
//
// These routes are accessible by anyone. They're the "entry points" to the
// auth system — you need them to GET a token in the first place.

// POST /api/v1/auth/register — Create a new user account
// Validates: email, password (8-128 chars), firstName, lastName
router.post('/register', validate({ body: registerSchema }), register);

// POST /api/v1/auth/login — Authenticate with email + password
// Validates: email format, password non-empty (min 1 — don't leak policy)
router.post('/login', validate({ body: loginSchema }), login);

// POST /api/v1/auth/refresh — Exchange refresh token for new tokens
// Validates: refreshToken is a non-empty string
router.post('/refresh', validate({ body: refreshTokenSchema }), refresh);

// ─────────────────────────────────────────────────────────────────────────────
// Protected Routes (require valid access token)
// ─────────────────────────────────────────────────────────────────────────────
//
// The `authenticate` middleware runs first:
//   1. Reads the Authorization: Bearer <token> header
//   2. Verifies the JWT signature and expiry
//   3. Sets req.user = { userId, email, role }
//   4. Calls next() on success, throws UnauthorizedError on failure

// POST /api/v1/auth/logout — Client-side logout (server acknowledges)
// Requires auth so we know the token was valid (gives the client confidence)
router.post('/logout', authenticate, logout);

// GET /api/v1/auth/me — Get the current user's profile
// The userId comes from the JWT (req.user.userId), not a URL param
router.get('/me', authenticate, getMe);

export default router;

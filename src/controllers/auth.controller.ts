/**
 * src/controllers/auth.controller.ts — Authentication HTTP Controller
 *
 * PURPOSE:
 *   Handles HTTP requests for authentication endpoints.
 *   Thin layer — extracts data from req, calls authService, sends response.
 *
 * ENDPOINTS:
 *   POST /api/v1/auth/register  → Create new account + tokens  (PUBLIC)
 *   POST /api/v1/auth/login     → Authenticate + get tokens    (PUBLIC)
 *   POST /api/v1/auth/refresh   → Exchange refresh → new tokens (PUBLIC)
 *   POST /api/v1/auth/logout    → Client-side logout hint       (PROTECTED)
 *   GET  /api/v1/auth/me        → Get current user profile      (PROTECTED)
 *
 * WHY IS LOGOUT A NO-OP?
 * ───────────────────────────────────────────────────────────────────────────
 *   JWTs are stateless — the server doesn't store them.
 *   You can't "invalidate" a JWT without a server-side blacklist.
 *
 *   For now, "logout" is a hint to the client to delete its stored tokens.
 *   Phase 9 (Redis) adds a proper token blacklist for real server-side logout.
 *
 *   The endpoint still exists so the frontend has a consistent API
 *   and we can add server-side logic later without changing the contract.
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   [ApiController]
 *   [Route("api/v1/auth")]
 *   public class AuthController : ControllerBase {
 *     [HttpPost("register")]
 *     public async Task<ActionResult<AuthResponse>> Register(RegisterDto dto) { ... }
 *
 *     [HttpPost("login")]
 *     public async Task<ActionResult<AuthResponse>> Login(LoginDto dto) { ... }
 *
 *     [Authorize]
 *     [HttpGet("me")]
 *     public async Task<ActionResult<UserDto>> GetMe() { ... }
 *   }
 */

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess, sendCreated } from '../utils/apiResponse';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new user account.
 *
 * Request body (validated by registerSchema):
 *   { email, password, firstName, lastName }
 *
 * Response (201 Created):
 *   { success: true, data: { user, accessToken, refreshToken } }
 *
 * Errors:
 *   400 → Validation errors (bad email format, password too short, etc.)
 *   409 → Email already in use (ConflictError)
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  // req.body has been validated and transformed by Zod:
  //   - email is lowercased + trimmed
  //   - firstName/lastName are trimmed
  //   - password passes min/max checks
  const result = await authService.register(req.body);

  // 201 Created — a new resource (user account) was created.
  // The response includes the user profile AND tokens so the client
  // is immediately logged in after registration (no separate login step).
  sendCreated(res, result, 'Registration successful');
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log in with email and password.
 *
 * Request body (validated by loginSchema):
 *   { email, password }
 *
 * Response (200 OK):
 *   { success: true, data: { user, accessToken, refreshToken } }
 *
 * Errors:
 *   400 → Validation errors (missing email/password)
 *   401 → Invalid email or password (same message for both — security)
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await authService.login(email, password);

  sendSuccess(res, result, 'Login successful');
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exchange a refresh token for new access + refresh tokens.
 *
 * Request body (validated by refreshTokenSchema):
 *   { refreshToken: "eyJhbGciOiJIUzI1NiJ9..." }
 *
 * Response (200 OK):
 *   { success: true, data: { accessToken, refreshToken } }
 *
 * Errors:
 *   400 → Missing refresh token
 *   401 → Invalid or expired refresh token
 *
 * NOTE: This implements TOKEN ROTATION — both tokens are regenerated.
 * The old refresh token should be discarded by the client.
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const tokens = await authService.refreshToken(refreshToken);

  sendSuccess(res, tokens, 'Tokens refreshed successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log out the current user.
 *
 * Currently a NO-OP on the server side. The client should:
 *   1. Delete the stored access token
 *   2. Delete the stored refresh token
 *   3. Redirect to login page
 *
 * Phase 9 (Redis) will add server-side token blacklisting:
 *   - Add the access token to a Redis blacklist
 *   - The authenticate middleware will check the blacklist
 *   - Blacklisted tokens are rejected even if they haven't expired
 *
 * We still require authentication here so only logged-in users can "log out".
 * This also confirms to the client that the token WAS valid (if they get 200).
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // For now, just acknowledge the logout request.
  // The real work happens client-side (delete tokens).
  // Phase 9 adds: await tokenBlacklist.add(req.user.accessToken);
  sendSuccess(res, null, 'Logged out successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the currently authenticated user's profile.
 *
 * The userId comes from the JWT (set by authenticate middleware on req.user),
 * NOT from a URL parameter. This means:
 *   - Users can ONLY see their own profile through this endpoint
 *   - No need for an ownership check — the JWT IS the ownership proof
 *
 * Response (200 OK):
 *   { success: true, data: { id, email, firstName, lastName, role, ... } }
 *
 * Errors:
 *   401 → Not authenticated (no/invalid token)
 *   404 → User not found (deleted after token was issued — rare edge case)
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // req.user is set by authenticate middleware.
  // The non-null assertion (!) is safe here because this route is protected
  // by authenticate — if req.user were missing, authenticate would have
  // already thrown UnauthorizedError before reaching this controller.
  const user = await authService.getMe(req.user!.userId);

  sendSuccess(res, user);
});

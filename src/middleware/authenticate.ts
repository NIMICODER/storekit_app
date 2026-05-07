/**
 * src/middleware/authenticate.ts — JWT Authentication Middleware
 *
 * PURPOSE:
 *   Verifies that the incoming request has a valid JWT access token.
 *   If valid, attaches the decoded user info to req.user.
 *   If invalid/missing, throws UnauthorizedError (401).
 *
 * WHERE IT SITS IN THE MIDDLEWARE CHAIN:
 * ───────────────────────────────────────────────────────────────────────────
 *   Request → authenticate → authorize? → validate → controller
 *              │
 *              ├─ No token      → 401 Unauthorized
 *              ├─ Invalid token → 401 Unauthorized
 *              └─ Valid token   → sets req.user, calls next()
 *
 * HOW THE AUTHORIZATION HEADER WORKS:
 * ───────────────────────────────────────────────────────────────────────────
 *   The client sends the JWT in the HTTP Authorization header:
 *     Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQi...
 *
 *   "Bearer" is a standard prefix defined in RFC 6750.
 *   It means "I'm bearing (carrying) this token as my credential."
 *
 *   Other auth schemes exist (Basic, Digest), but Bearer is standard for JWTs.
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   In ASP.NET Core, this is done AUTOMATICALLY by the JWT middleware:
 *
 *     services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
 *       .AddJwtBearer(options => {
 *         options.TokenValidationParameters = new TokenValidationParameters {
 *           ValidateIssuerSigningKey = true,
 *           IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
 *         };
 *       });
 *
 *   After this, any [Authorize] controller automatically requires a valid JWT.
 *   The framework reads the header, verifies the token, and sets HttpContext.User.
 *
 *   In Express, we build this behavior manually with middleware.
 *
 * USAGE IN ROUTES:
 *   import { authenticate } from '../middleware/authenticate';
 *
 *   // Protect a single route:
 *   router.get('/me', authenticate, getMe);
 *
 *   // Protect all routes in a router:
 *   router.use(authenticate);
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../errors';

/**
 * Express middleware that authenticates requests via JWT.
 *
 * This is a SYNCHRONOUS middleware — jwt.verify() is synchronous (it's pure
 * math: decode Base64, compute HMAC, compare). No database calls needed.
 * That's a key advantage of JWTs over session-based auth (which requires
 * a database lookup on EVERY request).
 *
 * Since it's synchronous and throws directly (like validate() middleware),
 * Express's error handling catches the thrown error and forwards it to
 * the global error handler.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // ─── Step 1: Extract the token from the Authorization header ────────────
  //
  // The header looks like: "Bearer eyJhbGciOiJIUzI1NiJ9..."
  // We need to split on the space and take the second part.
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No Authorization header, or it's not using the Bearer scheme.
    // This means the client didn't include a token at all.
    throw new UnauthorizedError('No token provided');
  }

  // Split "Bearer <token>" and take the token part.
  // authHeader.split(' ') → ['Bearer', 'eyJhbGciOiJIUzI1NiJ9...']
  const token = authHeader.split(' ')[1];

  if (!token) {
    // Edge case: header is literally "Bearer " with nothing after the space
    throw new UnauthorizedError('No token provided');
  }

  // ─── Step 2: Verify the token and extract the payload ───────────────────
  //
  // verifyAccessToken() either:
  //   - Returns { userId, email, role, iat, exp } on success
  //   - Throws UnauthorizedError on failure (expired, tampered, malformed)
  const decoded = verifyAccessToken(token);

  // ─── Step 3: Attach user info to the request object ─────────────────────
  //
  // Now every downstream handler (authorize, validate, controller) can
  // access req.user to know WHO is making the request.
  //
  // This is like ASP.NET's HttpContext.User — a strongly-typed identity
  // object available throughout the request pipeline.
  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  };

  // ─── Step 4: Continue to the next middleware ────────────────────────────
  next();
}

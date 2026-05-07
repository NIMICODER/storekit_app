/**
 * src/utils/jwt.ts — JSON Web Token (JWT) Utilities
 *
 * PURPOSE:
 *   Handles creation and verification of JWTs for authentication.
 *   Two token types: access tokens (short-lived) and refresh tokens (long-lived).
 *
 * WHAT IS A JWT?
 * ───────────────────────────────────────────────────────────────────────────
 *   A JWT is a Base64-encoded string with three parts separated by dots:
 *     header.payload.signature
 *
 *   Example:
 *     eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiQURNSU4ifQ.abc123sig
 *     │                    │                                                │
 *     └─ header            └─ payload (our data)                           └─ signature
 *
 *   - Header: algorithm used (HS256) + token type (JWT)
 *   - Payload: our custom data (userId, email, role) + expiry time
 *   - Signature: HMAC-SHA256(header + payload, secret) — proves nobody tampered
 *
 *   IMPORTANT: The payload is NOT encrypted — it's just Base64 encoded.
 *   Anyone can decode it and read userId/email/role. The signature only
 *   proves the data hasn't been MODIFIED, not that it's SECRET.
 *   → Never put sensitive data (passwords, credit cards) in the payload.
 *
 * TWO-TOKEN STRATEGY:
 * ───────────────────────────────────────────────────────────────────────────
 *   Access Token (15 min):
 *     - Sent with every API request in the Authorization header
 *     - Short-lived → if stolen, damage is limited to 15 minutes
 *     - NOT stored in the database (stateless verification)
 *
 *   Refresh Token (7 days):
 *     - Used ONLY to get a new access token when the old one expires
 *     - Longer-lived → stored more securely (httpOnly cookie in production)
 *     - Signed with a DIFFERENT secret (defense in depth)
 *
 *   Flow:
 *     Login → get both tokens
 *     API call → send access token → 200 OK
 *     Access token expires → send refresh token → get new access + refresh tokens
 *     Refresh token expires → user must log in again
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   // Creating a token:
 *   var tokenHandler = new JwtSecurityTokenHandler();
 *   var tokenDescriptor = new SecurityTokenDescriptor {
 *     Subject = new ClaimsIdentity(new[] {
 *       new Claim("userId", user.Id),
 *       new Claim(ClaimTypes.Email, user.Email),
 *       new Claim(ClaimTypes.Role, user.Role)
 *     }),
 *     Expires = DateTime.UtcNow.AddMinutes(15),
 *     SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
 *   };
 *   string token = tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
 *
 *   // Verifying a token (ASP.NET does this automatically with AddJwtBearer):
 *   services.AddAuthentication().AddJwtBearer(options => {
 *     options.TokenValidationParameters = new TokenValidationParameters {
 *       ValidateIssuerSigningKey = true,
 *       IssuerSigningKey = new SymmetricSecurityKey(keyBytes)
 *     };
 *   });
 */

import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The data we embed in every JWT.
 *
 * This is our custom "claims" — the meaningful data that identifies the user.
 * When the authenticate middleware verifies a token, it extracts these fields
 * and sets them on req.user.
 *
 * C# equivalent:
 *   public record JwtPayload(string UserId, string Email, string Role);
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * The full decoded token, including standard JWT fields added by the library.
 *
 * When jwt.verify() succeeds, it returns our payload PLUS:
 *   - iat (issued at): Unix timestamp when the token was created
 *   - exp (expires at): Unix timestamp when the token becomes invalid
 *
 * These are standard JWT claims defined in RFC 7519.
 */
export interface DecodedToken extends JwtPayload {
  iat: number;
  exp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a short-lived ACCESS token.
 *
 * @param payload - User data to embed in the token (userId, email, role)
 * @returns Signed JWT string
 *
 * jwt.sign() does three things:
 *   1. Creates the header: { alg: "HS256", typ: "JWT" }
 *   2. Creates the payload: our data + iat + exp
 *   3. Signs both with HMAC-SHA256 using the secret
 *
 * The expiresIn option uses human-readable strings:
 *   '15m' = 15 minutes, '1h' = 1 hour, '7d' = 7 days
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    // Cast to StringValue — the `ms` package uses a branded string type
    // to enforce valid duration strings like '15m', '1h', '7d' at the type level.
    // Our env value is a plain string, but it contains a valid ms-format value.
    expiresIn: env.jwtExpiry as StringValue,
  });
}

/**
 * Generate a long-lived REFRESH token.
 *
 * Uses a DIFFERENT secret than the access token.
 * Why? If the access secret leaks (from a log, error message, etc.),
 * the attacker still can't forge refresh tokens.
 *
 * @param payload - Same user data as the access token
 * @returns Signed JWT string (different secret + longer expiry)
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiry as StringValue,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify and decode an ACCESS token.
 *
 * jwt.verify() does:
 *   1. Decode the Base64 header + payload
 *   2. Recompute the signature using the secret
 *   3. Compare signatures — if different, someone tampered with the token
 *   4. Check the exp claim — if past now, the token is expired
 *
 * If anything fails, jwt.verify() throws:
 *   - JsonWebTokenError: invalid token (bad signature, malformed)
 *   - TokenExpiredError: token has expired
 *   - NotBeforeError: token not yet valid
 *
 * We catch ALL of these and throw our UnauthorizedError instead,
 * so the global error handler returns a consistent 401 response.
 *
 * @param token - The JWT string from the Authorization header
 * @returns Decoded payload with userId, email, role, iat, exp
 * @throws UnauthorizedError if the token is invalid or expired
 */
export function verifyAccessToken(token: string): DecodedToken {
  try {
    // jwt.verify() is SYNCHRONOUS (despite looking like it might be async).
    // It decodes the token, verifies the signature, and checks expiry — all in memory.
    // No database or network calls needed. This is a key advantage of JWTs.
    return jwt.verify(token, env.jwtSecret) as DecodedToken;
  } catch {
    // Don't expose the specific JWT error to the client.
    // "Token expired" vs "Token invalid" could help attackers.
    // Generic message is safer.
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Verify and decode a REFRESH token.
 *
 * Same logic as verifyAccessToken but uses the REFRESH secret.
 * Called only by the POST /auth/refresh endpoint.
 *
 * @param token - The refresh token string from the request body
 * @returns Decoded payload
 * @throws UnauthorizedError if the refresh token is invalid or expired
 */
export function verifyRefreshToken(token: string): DecodedToken {
  try {
    return jwt.verify(token, env.jwtRefreshSecret) as DecodedToken;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

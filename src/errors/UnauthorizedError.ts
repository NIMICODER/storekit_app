/**
 * src/errors/UnauthorizedError.ts — 401 Unauthorized Error
 *
 * PURPOSE:
 *   Thrown when a request lacks valid authentication credentials.
 *   Examples: missing JWT, expired token, invalid token signature.
 *
 * HTTP 401 vs 403 — IMPORTANT DISTINCTION:
 * ───────────────────────────────────────────────────────────────────────────
 *   401 Unauthorized = "Who are you?" — identity not established
 *     → No token provided, token expired, token invalid
 *     → Client should redirect to login
 *
 *   403 Forbidden = "I know who you are, but you can't do this"
 *     → Valid token, but wrong role (customer trying admin action)
 *     → Client should show "access denied" message
 *
 * USAGE:
 *   throw new UnauthorizedError();
 *   // → 401 { code: 'UNAUTHORIZED', message: 'Authentication required' }
 *
 *   throw new UnauthorizedError('Token has expired');
 *   // → 401 { code: 'UNAUTHORIZED', message: 'Token has expired' }
 *
 * C# EQUIVALENT:
 *   public class UnauthorizedException : ApiException {
 *     public UnauthorizedException(string message = "Authentication required")
 *       : base(message, 401, "UNAUTHORIZED") { }
 *   }
 *
 *   // Or using ASP.NET's built-in:
 *   return Unauthorized();  // returns 401
 */

import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  /**
   * @param message - Human-readable error message (default: 'Authentication required')
   *
   * SECURITY NOTE:
   *   Keep error messages GENERIC for auth failures. Don't say:
   *     "Token expired at 2024-01-15T10:30:00Z" — leaks timing info
   *     "User with email x@y.com not found" — confirms email doesn't exist
   *   Instead say:
   *     "Authentication required" or "Invalid credentials"
   */
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * src/errors/ForbiddenError.ts — 403 Forbidden Error
 *
 * PURPOSE:
 *   Thrown when an authenticated user tries to access a resource or perform
 *   an action they don't have permission for.
 *
 * KEY DIFFERENCE FROM 401:
 * ───────────────────────────────────────────────────────────────────────────
 *   401 = "I don't know who you are" (no/invalid credentials)
 *   403 = "I know who you are, but you're not allowed" (insufficient role)
 *
 * USAGE:
 *   throw new ForbiddenError();
 *   // → 403 { code: 'FORBIDDEN', message: 'Insufficient permissions' }
 *
 *   throw new ForbiddenError('Only admins can delete products');
 *   // → 403 { code: 'FORBIDDEN', message: 'Only admins can delete products' }
 *
 * C# EQUIVALENT:
 *   public class ForbiddenException : ApiException {
 *     public ForbiddenException(string message = "Insufficient permissions")
 *       : base(message, 403, "FORBIDDEN") { }
 *   }
 *
 *   // Or using ASP.NET's built-in:
 *   return Forbid();  // returns 403
 */

import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

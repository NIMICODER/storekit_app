/**
 * src/errors/ConflictError.ts — 409 Conflict Error
 *
 * PURPOSE:
 *   Thrown when a uniqueness constraint is violated.
 *   Examples: duplicate slug, duplicate SKU, duplicate email.
 *
 * USAGE:
 *   throw new ConflictError("Product with slug 'wireless-headphones' already exists");
 *   // → 409 { code: 'CONFLICT', message: "Product with slug '...' already exists" }
 *
 * C# EQUIVALENT:
 *   public class ConflictException : ApiException {
 *     public ConflictException(string message)
 *       : base(message, 409, "CONFLICT") { }
 *   }
 */

import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

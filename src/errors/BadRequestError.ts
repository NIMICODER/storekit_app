/**
 * src/errors/BadRequestError.ts — 400 Bad Request Error (generic)
 *
 * PURPOSE:
 *   Thrown for non-validation bad requests.
 *   Use when the request is logically invalid but doesn't involve
 *   specific field-level validation errors.
 *
 * USAGE:
 *   throw new BadRequestError('A category cannot be its own parent');
 *   // → 400 { code: 'BAD_REQUEST', message: 'A category cannot be its own parent' }
 *
 * WHEN TO USE BadRequestError vs ValidationError:
 * ───────────────────────────────────────────────────────────────────────────
 *   ValidationError → Zod schema failures (per-field errors with details[])
 *   BadRequestError → Business logic rejections (circular reference, etc.)
 *
 * C# EQUIVALENT:
 *   public class BadRequestException : ApiException {
 *     public BadRequestException(string message)
 *       : base(message, 400, "BAD_REQUEST") { }
 *   }
 */

import { AppError } from './AppError';

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
  }
}

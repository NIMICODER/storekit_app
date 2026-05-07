/**
 * src/errors/ValidationError.ts — 400 Validation Error (with per-field details)
 *
 * PURPOSE:
 *   Thrown when request input fails Zod schema validation.
 *   Carries a `details` array with per-field error messages so the frontend
 *   can highlight exactly which fields are invalid.
 *
 * USAGE:
 *   // The validate() middleware creates this automatically from Zod errors:
 *   throw new ValidationError([
 *     { field: 'body.name', message: 'Required' },
 *     { field: 'body.price', message: 'Number must be greater than 0' },
 *   ]);
 *
 *   // → 400 {
 *   //   code: 'VALIDATION_ERROR',
 *   //   message: 'Validation failed',
 *   //   details: [
 *   //     { field: 'body.name', message: 'Required' },
 *   //     { field: 'body.price', message: 'Number must be greater than 0' }
 *   //   ]
 *   // }
 *
 * C# EQUIVALENT:
 *   In ASP.NET Core, [ApiController] returns a ProblemDetails object
 *   with a similar shape when model validation fails:
 *
 *   {
 *     "errors": {
 *       "Name": ["The Name field is required."],
 *       "Price": ["Price must be greater than 0."]
 *     }
 *   }
 *
 *   Or with FluentValidation:
 *   public class ValidationException : ApiException {
 *     public List<ValidationFailure> Errors { get; }
 *   }
 */

import { AppError } from './AppError';

/**
 * Shape of a single field-level validation error.
 *
 * `field` uses dot notation to show which part of the request is invalid:
 *   - "body.name"      → request body's `name` field
 *   - "params.id"      → URL parameter `id`
 *   - "query.page"     → query string's `page` parameter
 */
export interface ValidationDetail {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  /**
   * Array of per-field validation errors.
   * This gets included in the API error response under `details`.
   */
  public readonly details: ValidationDetail[];

  constructor(details: ValidationDetail[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

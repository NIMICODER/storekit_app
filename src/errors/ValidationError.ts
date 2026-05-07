// ── 400 Validation Error ─────────────────────────────────────────────

import { AppError } from './AppError';

/** A single field-level validation error (dot-notation path, e.g. "body.name"). */
export interface ValidationDetail {
  field: string;
  message: string;
}

/** Thrown when Zod schema validation fails. Carries per-field error details. */
export class ValidationError extends AppError {
  public readonly details: ValidationDetail[];

  /** @param details - Array of per-field validation errors */
  constructor(details: ValidationDetail[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

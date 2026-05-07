// ── 409 Conflict ─────────────────────────────────────────────────────

import { AppError } from './AppError';

/** Thrown when a uniqueness constraint is violated (duplicate slug, SKU, email, etc.). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

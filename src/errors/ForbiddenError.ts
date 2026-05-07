// ── 403 Forbidden ────────────────────────────────────────────────────

import { AppError } from './AppError';

/** Thrown when an authenticated user lacks the required role/permission. */
export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

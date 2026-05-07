// ── 401 Unauthorized ─────────────────────────────────────────────────

import { AppError } from './AppError';

/** Thrown when authentication is missing or invalid (no token, expired, bad signature). */
export class UnauthorizedError extends AppError {
  /** @param message - Keep generic to avoid leaking auth details */
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

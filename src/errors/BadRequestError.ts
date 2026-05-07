// ── 400 Bad Request ──────────────────────────────────────────────────

import { AppError } from './AppError';

/** Thrown for non-validation bad requests (business logic rejections). */
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
  }
}

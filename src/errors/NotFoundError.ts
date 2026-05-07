// ── 404 Not Found ────────────────────────────────────────────────────

import { AppError } from './AppError';

/** Thrown when a requested resource does not exist. */
export class NotFoundError extends AppError {
  /** @param resource - Resource type (e.g. 'Product') */
  /** @param identifier - Lookup value (e.g. UUID or slug) */
  /** @param field - Field searched on (default: 'id') */
  constructor(resource: string, identifier: string, field = 'id') {
    super(
      `${resource} with ${field} '${identifier}' not found`,
      404,
      'NOT_FOUND',
    );
  }
}

// ── Express Request Augmentation ─────────────────────────────────────

export {};

declare global {
  namespace Express {
    interface Request {
      /** Unique request ID (UUID v4), set by requestLogger middleware. */
      requestId?: string;

      /** Request arrival timestamp (ms since epoch), for duration tracking. */
      startTime?: number;

      /** Authenticated user payload from JWT, set by authenticate middleware. */
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

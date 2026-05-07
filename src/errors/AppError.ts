// ── Base API Error ───────────────────────────────────────────────────

/** Base error class for all API errors. Never throw directly — use subclasses. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  /** true = expected/recoverable (bad input); false = unexpected bug (hide details) */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Fix prototype chain so `instanceof AppError` works after extending Error
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * src/errors/AppError.ts — Base Error Class for All API Errors
 *
 * PURPOSE:
 *   Every custom error in this API extends AppError. It carries:
 *     - statusCode: HTTP status (400, 404, 409, 500, etc.)
 *     - code:       Machine-readable error code ('NOT_FOUND', 'CONFLICT', etc.)
 *     - isOperational: Was this an expected error (bad input, not found) or a bug?
 *
 * WHY isOperational?
 * ───────────────────────────────────────────────────────────────────────────
 *   Operational errors = expected, recoverable (bad user input, missing resource)
 *   Programming errors = unexpected, bugs (null reference, type error)
 *
 *   The global error handler uses isOperational to decide:
 *     - Operational → send the error message to the client (it's safe)
 *     - Programming → send a generic "Internal Server Error" (don't leak internals)
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   public abstract class ApiException : Exception {
 *     public int StatusCode { get; }
 *     public string Code { get; }
 *     public bool IsOperational { get; }
 *
 *     protected ApiException(string message, int statusCode, string code, bool isOperational = true)
 *       : base(message) {
 *       StatusCode = statusCode;
 *       Code = code;
 *       IsOperational = isOperational;
 *     }
 *   }
 *
 * USAGE:
 *   Never throw AppError directly — use a subclass:
 *     throw new NotFoundError('Product', productId);
 *     throw new ConflictError('Product with slug already exists');
 *     throw new ValidationError(zodErrors);
 */

export class AppError extends Error {
  /**
   * HTTP status code to send in the response (e.g., 400, 404, 409, 500).
   *
   * In C#, you'd set this on an exception and read it in a global filter:
   *   catch (ApiException ex) { return StatusCode(ex.StatusCode, ...); }
   */
  public readonly statusCode: number;

  /**
   * Machine-readable error code for frontend consumption.
   * Examples: 'NOT_FOUND', 'CONFLICT', 'VALIDATION_ERROR', 'BAD_REQUEST'
   *
   * The frontend can switch on this code to show appropriate UI:
   *   if (error.code === 'VALIDATION_ERROR') showFieldErrors(error.details);
   *   if (error.code === 'NOT_FOUND') show404Page();
   */
  public readonly code: string;

  /**
   * Was this error expected (operational) or a bug (programming error)?
   *
   * true  = operational: bad input, not found, duplicate — safe to show to client
   * false = programming: null pointer, type error — hide details, log for debugging
   *
   * In C#, you might distinguish these via exception types:
   *   ApiException (operational) vs Exception (programming)
   */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    // Call the parent Error constructor with the message.
    // In C#: base(message)
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // FIX: Restore the prototype chain.
    //
    // WHY IS THIS NEEDED?
    // ──────────────────────────────────────────────────────────────────────
    // In JavaScript/TypeScript, when you extend a built-in class like Error,
    // the prototype chain can break. This means:
    //   error instanceof AppError  → false  (WRONG!)
    //
    // Object.setPrototypeOf fixes this so instanceof checks work correctly.
    //
    // This is a known TypeScript issue when targeting ES5/ES6.
    // C# doesn't have this problem — inheritance "just works."
    //
    // See: https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture a clean stack trace, excluding the constructor itself.
    // This is like C#'s StackTrace — helps in debugging.
    Error.captureStackTrace(this, this.constructor);
  }
}

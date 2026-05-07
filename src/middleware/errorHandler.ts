/**
 * src/middleware/errorHandler.ts — Global Error Handling Middleware
 *
 * PURPOSE:
 *   Catches ALL errors thrown anywhere in the request pipeline and sends
 *   a standardized JSON error response. This is the SINGLE PLACE where
 *   errors become HTTP responses.
 *
 * HOW EXPRESS ERROR HANDLING WORKS:
 * ───────────────────────────────────────────────────────────────────────────
 *   Express identifies error-handling middleware by its FOUR parameters:
 *     (err, req, res, next)  ← 4 params = error handler
 *     (req, res, next)       ← 3 params = regular middleware
 *
 *   When any middleware or route calls next(error), Express SKIPS all
 *   regular middleware and jumps straight to the first 4-param middleware.
 *
 *   Flow:
 *     Request → Route → Controller throws NotFoundError
 *                            ↓
 *     asyncHandler catches → next(NotFoundError)
 *                            ↓
 *     Express skips everything → jumps to errorHandler
 *                            ↓
 *     errorHandler formats → { success: false, error: { code, message } }
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   app.UseExceptionHandler(app => {
 *     app.Run(async context => {
 *       var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
 *       // ... format and send JSON error
 *     });
 *   });
 *
 *   Or a global exception filter:
 *   public class GlobalExceptionFilter : IExceptionFilter {
 *     public void OnException(ExceptionContext context) {
 *       if (context.Exception is ApiException apiEx) {
 *         context.Result = new ObjectResult(new { ... }) { StatusCode = apiEx.StatusCode };
 *       }
 *     }
 *   }
 *
 * IMPORTANT:
 *   This middleware MUST be registered LAST in app.ts (after all routes).
 *   Express processes middleware in order, so error handlers must come after
 *   all the code that might throw errors.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ValidationError } from '../errors/ValidationError';
import { NotFoundError } from '../errors/NotFoundError';
import { ConflictError } from '../errors/ConflictError';
import { env } from '../config/env';

/**
 * Global error handling middleware.
 *
 * MUST have exactly 4 parameters — Express uses the argument count
 * to distinguish error handlers from regular middleware.
 * The `_next` param is unused but REQUIRED for Express to recognize this
 * as an error handler. We prefix it with _ to tell the linter it's intentional.
 *
 * @param err  - The error object (thrown or passed via next(error))
 * @param req  - Express Request (used for logging context)
 * @param res  - Express Response (used to send the error JSON)
 * @param _next - NextFunction (unused but required for Express signature)
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ─────────────────────────────────────────────────────────────────────────
  // CASE 1: Operational AppError (our custom errors)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // These are errors we INTENTIONALLY threw:
  //   throw new NotFoundError('Product', id)
  //   throw new ConflictError('Slug already exists')
  //   throw new ValidationError([...])
  //
  // They're "operational" — expected, safe to show to the client.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        // Include validation details if this is a ValidationError.
        // The `details` array has per-field errors like:
        //   [{ field: 'body.name', message: 'Required' }]
        //
        // For other AppError subclasses, there are no details to include.
        ...(err instanceof ValidationError && { details: err.details }),
        // In development, include the stack trace for debugging.
        // In production, NEVER expose stack traces — they reveal file paths,
        // function names, and internal structure.
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 2: Prisma Known Errors
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Prisma throws specific error codes for database constraint violations.
  // We map these to our AppError subclasses so clients get clean responses
  // instead of raw database errors.
  //
  // Prisma error codes:
  //   P2002 = Unique constraint violation (duplicate email, slug, SKU)
  //   P2025 = Record not found (findUniqueOrThrow, update, delete on missing record)
  //
  // We check for these by looking at the error's `code` property.
  // Prisma errors have a `code` string and a `meta` object with details.
  //
  // C# equivalent: catching DbUpdateException in EF Core and checking
  // for SqlException with specific error numbers.
  //
  // NOTE: We check the `code` property instead of `instanceof PrismaClientKnownRequestError`
  // because importing the Prisma error class can be tricky with the generated client.
  const prismaError = err as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (prismaError.code === 'P2002') {
    // P2002: Unique constraint failed.
    // prismaError.meta.target contains the field(s) that caused the violation.
    // Example: meta.target = ['slug'] for a duplicate product slug.
    const fields = (prismaError.meta?.target as string[]) ?? ['unknown'];
    const fieldList = fields.join(', ');

    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `A record with this ${fieldList} already exists`,
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  if (prismaError.code === 'P2025') {
    // P2025: Record to update/delete does not exist.
    // This happens when Prisma's findUniqueOrThrow, update, or delete
    // targets a record that doesn't exist.
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: prismaError.meta?.cause ?? 'Record not found',
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 3: Unknown / Programming Errors
  // ─────────────────────────────────────────────────────────────────────────
  //
  // If we get here, it's an error we did NOT anticipate:
  //   - TypeError, ReferenceError (bugs in our code)
  //   - Database connection failures
  //   - Third-party library errors
  //
  // SECURITY: Never expose internal error details to clients in production.
  // Log the full error for debugging, but send a generic message.
  //
  // In C#, this is the equivalent of catching Exception at the top level:
  //   catch (Exception ex) {
  //     _logger.LogError(ex, "Unhandled exception");
  //     return StatusCode(500, new { message = "Internal Server Error" });
  //   }

  // Always log unexpected errors — this is how you discover bugs.
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isDevelopment
        ? err.message
        : 'An unexpected error occurred',
      // Stack trace only in development — NEVER in production
      ...(env.isDevelopment && { stack: err.stack }),
    },
  });
}

/**
 * src/middleware/asyncHandler.ts — Async Route Handler Wrapper
 *
 * PURPOSE:
 *   Wraps async Express route handlers so that rejected promises
 *   automatically call next(error) — sending the error to the
 *   global error handler instead of crashing the server.
 *
 * THE PROBLEM IT SOLVES:
 * ───────────────────────────────────────────────────────────────────────────
 *   Express does NOT catch async errors by default. If an async handler
 *   throws, the promise rejects silently and the request hangs forever:
 *
 *     // BAD — unhandled rejection if productService.getProducts() throws
 *     router.get('/', async (req, res) => {
 *       const products = await productService.getProducts();  // throws!
 *       res.json(products);  // never reached
 *       // Express never sends a response → request hangs → client times out
 *     });
 *
 *   Without asyncHandler, every controller needs its own try/catch:
 *
 *     // VERBOSE — try/catch in EVERY handler
 *     router.get('/', async (req, res, next) => {
 *       try {
 *         const products = await productService.getProducts();
 *         res.json(products);
 *       } catch (error) {
 *         next(error);  // forward to error handler
 *       }
 *     });
 *
 *   asyncHandler eliminates all that boilerplate:
 *
 *     // CLEAN — asyncHandler catches and forwards automatically
 *     router.get('/', asyncHandler(async (req, res) => {
 *       const products = await productService.getProducts();
 *       res.json(products);
 *     }));
 *
 * HOW IT WORKS:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. asyncHandler receives your async function
 *   2. Returns a NEW function that Express calls on each request
 *   3. The new function calls your handler inside Promise.resolve()
 *   4. If the promise rejects (your handler threw), .catch(next) fires
 *   5. next(error) sends the error to Express's error handling middleware
 *   6. Our global errorHandler (errorHandler.ts) formats and sends the response
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   In ASP.NET Core, you don't need this! The framework automatically:
 *     1. Awaits async controller methods
 *     2. Catches any unhandled exceptions
 *     3. Passes them to the exception handling middleware
 *
 *   Express doesn't do this (it was designed before async/await existed),
 *   so we need asyncHandler as a bridge.
 *
 *   The closest C# pattern is a global exception filter:
 *     services.AddControllers(options => {
 *       options.Filters.Add<GlobalExceptionFilter>();
 *     });
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Type for an async Express route handler.
 *
 * This is the function signature that your controllers export:
 *   async (req: Request, res: Response, next: NextFunction) => void
 *
 * The `next` parameter is optional because most handlers don't call it
 * directly — asyncHandler calls next(error) for them on failure.
 */
type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Wraps an async Express route handler to catch rejected promises.
 *
 * @param fn - Your async route handler function
 * @returns A wrapped function that Express can use as middleware
 *
 * Usage in controllers:
 *   export const getProducts = asyncHandler(async (req, res) => {
 *     const products = await productService.getProducts(req.query);
 *     sendSuccess(res, products);
 *   });
 *
 * What happens when the handler throws:
 *   1. productService.getProducts() rejects with NotFoundError
 *   2. Promise.resolve(...).catch(next) catches it
 *   3. next(NotFoundError) is called
 *   4. Express skips to the error handler middleware (errorHandler.ts)
 *   5. errorHandler sends { success: false, error: { code: 'NOT_FOUND', ... } }
 */
export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Promise.resolve() handles both:
    //   - Functions that return a promise (async functions)
    //   - Functions that throw synchronously (wraps in a rejected promise)
    //
    // .catch(next) forwards the error to Express's error pipeline.
    //
    // This is equivalent to:
    //   try { await fn(req, res, next); } catch (error) { next(error); }
    // But more concise.
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

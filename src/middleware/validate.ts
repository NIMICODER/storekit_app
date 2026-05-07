/**
 * src/middleware/validate.ts — Zod Validation Middleware Factory
 *
 * PURPOSE:
 *   Creates Express middleware that validates req.body, req.params, and/or
 *   req.query against Zod schemas BEFORE the request reaches the controller.
 *
 *   If validation passes → replaces req.body/params/query with parsed values
 *   (coerced types, defaults applied) and calls next().
 *
 *   If validation fails → throws a ValidationError with per-field details.
 *
 * THE FLOW:
 * ───────────────────────────────────────────────────────────────────────────
 *   Request → validate(schema) → Controller
 *                  ↓ fail
 *             ValidationError → errorHandler → { success: false, error: {...} }
 *
 * WHY VALIDATE IN MIDDLEWARE (not in the controller)?
 * ───────────────────────────────────────────────────────────────────────────
 *   1. SEPARATION OF CONCERNS: Controllers don't need to know about Zod
 *   2. REUSABILITY: Same schema can be used for multiple routes
 *   3. CONSISTENCY: All routes validate the same way
 *   4. CLEAN CONTROLLERS: Controller code only deals with valid data
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   ASP.NET Core has built-in validation via [ApiController]:
 *
 *     [HttpPost]
 *     public IActionResult Create([FromBody] CreateProductDto dto) {
 *       // If dto fails validation, ASP.NET returns 400 AUTOMATICALLY
 *       // before your method even runs. You never see invalid data.
 *     }
 *
 *   Or with FluentValidation middleware:
 *     services.AddFluentValidationAutoValidation();
 *     // Validators run automatically before controller methods
 *
 *   Our validate() middleware works the same way — it runs BEFORE the
 *   controller and rejects invalid requests automatically.
 *
 * USAGE IN ROUTES:
 *   import { validate } from '../middleware/validate';
 *   import { createProductSchema, idParamSchema } from '../validators/...';
 *
 *   router.post('/', validate({ body: createProductSchema }), createProduct);
 *   router.get('/:id', validate({ params: idParamSchema }), getProductById);
 *   router.get('/', validate({ query: paginationSchema }), getProducts);
 */

import { Request, Response, NextFunction } from 'express';
import { type ZodType, ZodError } from 'zod';
import { ValidationError, type ValidationDetail } from '../errors';

/**
 * Schema definition for the validate() middleware.
 *
 * You provide Zod schemas for whichever parts of the request need validation.
 * All three are optional — you only validate what you need:
 *
 *   validate({ body: createProductSchema })                // body only
 *   validate({ params: idParamSchema })                    // params only
 *   validate({ query: paginationSchema })                  // query only
 *   validate({ params: idParamSchema, body: updateSchema }) // both
 */
interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Creates validation middleware from Zod schemas.
 *
 * @param schemas - Object with optional body, params, query Zod schemas
 * @returns Express middleware that validates and transforms request data
 *
 * How it works:
 *   1. For each provided schema (body, params, query):
 *      a. Run Zod's safeParse() on the corresponding req property
 *      b. If valid → replace req[property] with the parsed value
 *         (this applies defaults, coerces types, strips unknown fields)
 *      c. If invalid → collect all field-level errors
 *   2. If ANY schema failed → throw ValidationError with all collected errors
 *   3. If all schemas passed → call next() to proceed to the controller
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Collect all validation errors across body, params, and query.
    // We validate ALL of them before reporting — this way the client
    // sees ALL errors at once instead of fixing one and hitting another.
    //
    // C# FluentValidation does the same: validates everything first,
    // then returns all failures in a single response.
    const errors: ValidationDetail[] = [];

    // ─── Validate body ───────────────────────────────────────────────────
    if (schemas.body) {
      // safeParse() returns { success: true, data } or { success: false, error }
      // Unlike parse(), it does NOT throw — we handle errors ourselves.
      const result = schemas.body.safeParse(req.body);

      if (result.success) {
        // Replace req.body with the parsed & transformed data.
        // This is important because Zod may have:
        //   - Applied defaults (e.g., isActive defaults to true)
        //   - Coerced types (e.g., string "42" → number 42)
        //   - Stripped unknown fields (if using .strict() or .strip())
        req.body = result.data;
      } else {
        // Convert Zod errors to our ValidationDetail format.
        // Zod's error.issues is an array of detailed error objects.
        collectZodErrors(result.error, 'body', errors);
      }
    }

    // ─── Validate params ─────────────────────────────────────────────────
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);

      if (result.success) {
        // Replace req.params with parsed values.
        // We cast through any because Express types req.params as ParamsDictionary
        // (Record<string, string>), but Zod may have transformed the types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = result.data as any;
      } else {
        collectZodErrors(result.error, 'params', errors);
      }
    }

    // ─── Validate query ──────────────────────────────────────────────────
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);

      if (result.success) {
        // Replace req.query with parsed values.
        // This is especially useful for query strings because ALL values
        // arrive as strings from the URL. Zod's z.coerce.number() converts
        // "10" to 10, z.coerce.boolean() converts "true" to true, etc.
        //
        // In C#, [FromQuery] does this automatically. In Express, we
        // need Zod + this middleware to get the same behavior.
        (req as any).query = result.data; // eslint-disable-line @typescript-eslint/no-explicit-any
      } else {
        collectZodErrors(result.error, 'query', errors);
      }
    }

    // ─── Report errors or continue ───────────────────────────────────────
    if (errors.length > 0) {
      // Throw our custom ValidationError with all field-level details.
      // asyncHandler (in the controller) catches this and calls next(error).
      // The global errorHandler then formats it into the standard response shape.
      throw new ValidationError(errors);
    }

    // All validation passed — proceed to the next middleware / controller.
    next();
  };
}

/**
 * Converts Zod error issues into our ValidationDetail format.
 *
 * Zod's error.issues looks like:
 *   [
 *     { path: ['name'], message: 'Required', code: 'invalid_type' },
 *     { path: ['price'], message: 'Expected number, got string', ... }
 *   ]
 *
 * We convert each to:
 *   { field: 'body.name', message: 'Required' }
 *   { field: 'body.price', message: 'Expected number, got string' }
 *
 * The `source` prefix ('body', 'params', 'query') tells the client
 * WHERE the invalid field is — helpful for debugging.
 *
 * @param zodError - The ZodError from safeParse()
 * @param source   - Which part of the request ('body', 'params', 'query')
 * @param errors   - Array to push errors into (mutated in place)
 */
function collectZodErrors(
  zodError: ZodError,
  source: string,
  errors: ValidationDetail[],
): void {
  for (const issue of zodError.issues) {
    // issue.path is an array of keys: ['address', 'street'] → 'address.street'
    // We join with dots and prefix with the source.
    const fieldPath = issue.path.length > 0
      ? `${source}.${issue.path.join('.')}`
      : source;

    errors.push({
      field: fieldPath,
      message: issue.message,
    });
  }
}

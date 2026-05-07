// src/middleware/validate.ts — Zod validation middleware factory

import { Request, Response, NextFunction } from 'express';
import { type ZodType, ZodError } from 'zod';
import { ValidationError, type ValidationDetail } from '../errors';

/** Zod schemas for request validation (all optional). */
interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Creates middleware that validates req.body/params/query against Zod schemas.
 * On success, replaces request data with parsed values (defaults applied, types coerced).
 * On failure, throws ValidationError with all field-level errors.
 * @param schemas - Object with optional body, params, query Zod schemas
 * @returns Express validation middleware
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Collect all errors so the client sees every problem at once
    const errors: ValidationDetail[] = [];

    // ── Validate body ──────────────────────────────────────────────────────
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);

      if (result.success) {
        req.body = result.data;
      } else {
        collectZodErrors(result.error, 'body', errors);
      }
    }

    // ── Validate params ────────────────────────────────────────────────────
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);

      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = result.data as any;
      } else {
        collectZodErrors(result.error, 'params', errors);
      }
    }

    // ── Validate query ─────────────────────────────────────────────────────
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);

      if (result.success) {
        (req as any).query = result.data; // eslint-disable-line @typescript-eslint/no-explicit-any
      } else {
        collectZodErrors(result.error, 'query', errors);
      }
    }

    // ── Report or continue ─────────────────────────────────────────────────
    if (errors.length > 0) {
      throw new ValidationError(errors);
    }

    next();
  };
}

/**
 * Converts ZodError issues into ValidationDetail format.
 * @param zodError - The ZodError from safeParse()
 * @param source - Request property name ('body', 'params', 'query')
 * @param errors - Array to append errors into
 */
function collectZodErrors(
  zodError: ZodError,
  source: string,
  errors: ValidationDetail[],
): void {
  for (const issue of zodError.issues) {
    const fieldPath = issue.path.length > 0
      ? `${source}.${issue.path.join('.')}`
      : source;

    errors.push({
      field: fieldPath,
      message: issue.message,
    });
  }
}

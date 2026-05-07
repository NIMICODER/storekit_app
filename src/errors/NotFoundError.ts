/**
 * src/errors/NotFoundError.ts — 404 Not Found Error
 *
 * PURPOSE:
 *   Thrown when a resource is not found in the database.
 *   Replaces the old pattern:
 *     const error = new Error(`Product with id '${id}' not found`);
 *     (error as any).statusCode = 404;  ← HACK — no more!
 *
 * USAGE:
 *   throw new NotFoundError('Product', productId);
 *   // → 404 { code: 'NOT_FOUND', message: "Product with id 'xxx' not found" }
 *
 *   throw new NotFoundError('Category', slug, 'slug');
 *   // → 404 { code: 'NOT_FOUND', message: "Category with slug 'electronics' not found" }
 *
 * C# EQUIVALENT:
 *   public class NotFoundException : ApiException {
 *     public NotFoundException(string resource, string identifier)
 *       : base($"{resource} with id '{identifier}' not found", 404, "NOT_FOUND") { }
 *   }
 */

import { AppError } from './AppError';

export class NotFoundError extends AppError {
  /**
   * @param resource   - The type of resource (e.g., 'Product', 'Category', 'User')
   * @param identifier - The ID or value that was looked up (e.g., UUID or slug)
   * @param field      - The field that was searched (default: 'id')
   *
   * Examples:
   *   new NotFoundError('Product', '550e8400-...')
   *   → "Product with id '550e8400-...' not found"
   *
   *   new NotFoundError('Category', 'electronics', 'slug')
   *   → "Category with slug 'electronics' not found"
   */
  constructor(resource: string, identifier: string, field = 'id') {
    super(
      `${resource} with ${field} '${identifier}' not found`,
      404,
      'NOT_FOUND',
    );
  }
}

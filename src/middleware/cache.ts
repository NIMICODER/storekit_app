// ── src/middleware/cache.ts ── Route-Level Caching Middleware ─────────
//
// Factory function that creates Express middleware for caching GET responses.
//
// HOW IT WORKS (Cache-Aside Pattern):
//   1. Request comes in → check Redis for cached response
//   2. Cache HIT  → return cached JSON immediately (skip controller + DB)
//   3. Cache MISS → let the request continue to the controller
//      → intercept res.json() to capture the response body
//      → store the response in Redis for next time
//      → send the response to the client as normal
//
// In C#, this is similar to [ResponseCache] attribute or
// app.UseResponseCaching() middleware — but we have more control here.
//
// WHY INTERCEPT res.json()?
// Express doesn't have a built-in "afterResponse" hook. So we override
// res.json() with a wrapper that caches the data before sending it.
// This is a common Express pattern — libraries like compression do the same.

import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cache.service';
import { env } from '../config/env';

// ── Cache Key Builder ───────────────────────────────────────────────

/**
 * Builds a cache key from prefix + request URL.
 *
 * Examples:
 *   prefix="products", url="/api/v1/products?page=1&limit=10"
 *   → "products:/api/v1/products?page=1&limit=10"
 *
 * The full URL (including query params) ensures each unique query
 * gets its own cache entry. No manual key building needed!
 *
 * @param prefix - Namespace prefix (e.g. "products", "categories")
 * @param url    - The original request URL (req.originalUrl)
 */
function buildCacheKey(prefix: string, url: string): string {
  return `${prefix}:${url}`;
}

// ── Cache Middleware Factory ────────────────────────────────────────

/**
 * Creates middleware that caches GET responses in Redis.
 *
 * Usage in routes:
 *   router.get('/', cacheMiddleware('products'), getProducts);
 *   router.get('/:id', cacheMiddleware('products', 300), getProductById);
 *
 * @param prefix     - Cache key namespace (e.g. "products")
 * @param ttlSeconds - Optional TTL override (defaults to env.CACHE_TTL)
 * @returns Express middleware function
 *
 * In C#, this is like creating a custom ActionFilterAttribute that
 * checks the cache in OnActionExecuting and stores in OnActionExecuted.
 */
export function cacheMiddleware(prefix: string, ttlSeconds?: number) {
  const ttl = ttlSeconds ?? env.cacheTtl;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ── Only cache GET requests ───────────────────────────────────
    // POST, PUT, DELETE change data — caching those would be dangerous.
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = buildCacheKey(prefix, req.originalUrl);

    try {
      // ── Step 1: Check the cache ──────────────────────────────────
      const cached = await cacheService.get<object>(key);

      if (cached !== null) {
        // CACHE HIT — return the cached response directly.
        // Skip the controller, skip the database query entirely.
        // This is why caching makes APIs fast: zero DB round-trips.
        res.json(cached);
        return;
      }

      // ── Step 2: Cache MISS — intercept res.json() ────────────────
      // Save a reference to the original res.json method, then replace
      // it with our wrapper that caches before sending.
      //
      // This is like a decorator pattern: we wrap the original method
      // with extra behavior (caching) without changing its interface.
      const originalJson = res.json.bind(res);

      // Override res.json with our caching wrapper.
      // When the controller calls res.json(data), this runs instead.
      res.json = ((body: unknown) => {
        // Only cache successful responses (200 OK).
        // Don't cache 404s, 400s, 500s, etc. — those are errors, not data.
        if (res.statusCode === 200) {
          // Fire-and-forget: don't await the cache write.
          // If Redis is slow, we don't want to delay the response to the client.
          // The client gets their data immediately; caching happens in the background.
          cacheService.set(key, body, ttl);
        }

        // Call the original res.json to actually send the response.
        return originalJson(body);
      }) as Response['json'];

      // ── Step 3: Continue to the controller ───────────────────────
      // The controller runs as normal and calls res.json(data),
      // which now goes through our wrapper above.
      next();
    } catch (error) {
      // If anything goes wrong with caching, just skip it.
      // The request continues to the controller as if caching didn't exist.
      // eslint-disable-next-line no-console
      console.warn('[Cache Middleware] Error:', error instanceof Error ? error.message : error);
      next();
    }
  };
}

// ── Manual Cache Invalidation Helper ────────────────────────────────

/**
 * Clear all cached entries for a given prefix.
 *
 * Call this from services after write operations (create/update/delete)
 * to ensure stale data is never served from cache.
 *
 * Example:
 *   await clearCache('products');  // Deletes all "products:*" keys
 *
 * @param prefix - The same prefix used in cacheMiddleware()
 */
export async function clearCache(prefix: string): Promise<void> {
  await cacheService.delByPattern(`${prefix}:*`);
}

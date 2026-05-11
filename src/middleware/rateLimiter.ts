// ── src/middleware/rateLimiter.ts ── Rate Limiting Middleware ─────────
//
// Protects the API from abuse by limiting the number of requests per IP
// within a sliding time window. Three tiers:
//
//   1. globalLimiter  — 100 req / 15 min (catches general abuse)
//   2. authLimiter    — 10 req / 15 min  (brute-force protection for login/register)
//   3. strictLimiter  — 20 req / 15 min  (checkout, webhook simulate)
//
// REDIS-BACKED (DISTRIBUTED):
//   Uses rate-limit-redis so the counters are shared across multiple
//   server instances (e.g. behind a load balancer). If Redis is down,
//   falls back to in-memory store (per-instance, not shared, but better
//   than no protection).
//
// HOW RATE LIMITING WORKS:
//   Each IP gets a counter in Redis with a TTL (the window).
//   Every request increments the counter. When the counter exceeds the
//   max, the middleware returns 429 Too Many Requests.
//
//   It's a "fixed window" algorithm — the counter resets after the TTL
//   expires. More sophisticated algorithms (sliding window, token bucket)
//   exist but fixed window is simple and sufficient for most APIs.
//
// C# COMPARISON:
//   ASP.NET 7+ has built-in rate limiting middleware:
//
//   builder.Services.AddRateLimiter(options => {
//     options.AddFixedWindowLimiter("global", opt => {
//       opt.PermitLimit = 100;
//       opt.Window = TimeSpan.FromMinutes(15);
//     });
//   });
//   app.UseRateLimiter();
//
//   In Express, we use the `express-rate-limit` package to achieve
//   the same thing. The concept is identical — only the syntax differs.

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisClient from '../config/redis';
import { env } from '../config/env';

// ── Redis Store Factory ──────────────────────────────────────────────
// Creates a RedisStore if Redis is available, otherwise returns undefined
// (which makes express-rate-limit fall back to its built-in MemoryStore).
//
// GRACEFUL DEGRADATION:
//   If Redis is down, rate limiting still works — just per-instance
//   instead of distributed. Better than no rate limiting at all.
//
// C# equivalent: You'd check if IDistributedCache is registered
// before wiring up the distributed rate limiter store.

function createRedisStore(prefix: string): RedisStore | undefined {
  if (!redisClient) {
    // eslint-disable-next-line no-console
    console.warn(`[RateLimit] Redis not available — using in-memory store for "${prefix}"`);
    return undefined;
  }

  // Capture a non-null reference so TypeScript knows it's safe inside the closure.
  // Without this, TS can't narrow `redisClient` (module-level let) inside the
  // arrow function — it might be reassigned between checks.
  const client = redisClient;

  return new RedisStore({
    // The `sendCommand` function bridges express-rate-limit ↔ node-redis.
    // rate-limit-redis sends raw Redis commands (like EVALSHA) and needs
    // a function that forwards them to the Redis client.
    //
    // `redis` v5 exposes `.sendCommand()` which accepts an array of strings.
    // We spread the args into an array — that's all the bridge needs.
    sendCommand: (...args: string[]) => client.sendCommand(args),

    // Prefix keys to avoid collisions with cache keys.
    // e.g. "rl:global:192.168.1.1" vs "cache:products:..."
    prefix: `rl:${prefix}:`,
  });
}

// ── Rate Limiter Factory ─────────────────────────────────────────────
// Creates a configured rate limiter middleware with the given options.
// All limiters share the same structure — only the limits differ.
//
// FACTORY PATTERN:
//   Instead of creating three separate rateLimit() calls with duplicated
//   config, we use a factory function. Same concept as C#'s
//   AddRateLimiter with named policies.

function createLimiter(name: string, windowMs: number, max: number) {
  return rateLimit({
    // Time window in milliseconds.
    // After this window expires, the counter resets.
    windowMs,

    // Maximum number of requests per window per IP.
    max,

    // Use Redis store if available (distributed), otherwise in-memory.
    // The `store` option is optional — if omitted, express-rate-limit
    // uses its built-in MemoryStore (fine for single-instance deployments).
    store: createRedisStore(name),

    // What to return when the limit is exceeded.
    // We match our standard error response format for consistency.
    message: {
      success: false,
      message: `Too many requests — limit is ${max} per ${windowMs / 60000} minutes. Please try again later.`,
    },

    // Include rate limit info in response headers so clients can
    // track their usage. Standard headers (RateLimit-Limit, etc.)
    // are recommended by the IETF draft.
    standardHeaders: true,

    // Disable the older X-RateLimit-* headers (legacy, non-standard).
    legacyHeaders: false,

    // Skip rate limiting for requests that fail (e.g. 4xx/5xx).
    // Only count successful requests toward the limit.
    // Set to false to count ALL requests (stricter).
    skipFailedRequests: false,
  });
}

// ── Exported Limiters ────────────────────────────────────────────────
// Each limiter is a middleware — just add it to the route chain.
//
// Usage:
//   router.post('/login', authLimiter, validate(...), login);
//   app.use(globalLimiter);  // apply to all routes

/**
 * Global rate limiter — applied to all API routes.
 * 100 requests per 15-minute window per IP.
 *
 * Catches general abuse without being too restrictive for normal usage.
 */
export const globalLimiter = createLimiter(
  'global',
  env.rateLimitWindowMs,
  env.rateLimitMax,
);

/**
 * Auth rate limiter — applied to login and register routes.
 * 10 requests per 15-minute window per IP.
 *
 * Brute-force protection: an attacker trying passwords at 10 req/15min
 * would need hours to try even a small dictionary.
 *
 * C# equivalent: AddFixedWindowLimiter("auth", opt => {
 *   opt.PermitLimit = 10;
 *   opt.Window = TimeSpan.FromMinutes(15);
 * });
 */
export const authLimiter = createLimiter('auth', env.rateLimitWindowMs, 10);

/**
 * Strict rate limiter — applied to sensitive endpoints like checkout.
 * 20 requests per 15-minute window per IP.
 *
 * Checkout creates orders and modifies stock — we want tighter limits
 * than general CRUD but not as strict as auth (legitimate users may
 * checkout a few times in a session).
 */
export const strictLimiter = createLimiter('strict', env.rateLimitWindowMs, 20);

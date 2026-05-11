// ── src/config/env.ts ── Environment Configuration ──────────────────

import dotenv from 'dotenv';

// Load .env before any process.env reads
dotenv.config();

// ── Helpers ─────────────────────────────────────────────────────────

/** @param key - Required env var name. @returns The value. @throws If missing or empty. */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];

  if (value === undefined || value === '') {
    throw new Error(
      `[Config] Missing required environment variable: "${key}"\n` +
        `  → Copy .env.example to .env and fill in the required values.`,
    );
  }

  return value;
}

/** @param key - Env var name. @param defaultValue - Fallback. @returns The value or default. */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// ── Configuration Object ────────────────────────────────────────────

/** Validated, typed app configuration — single source of truth for all env vars. */
export const env = {
  // ── Database ──────────────────────────────────────────────────────
  databaseUrl: getRequiredEnv('DATABASE_URL'),

  // ── App ───────────────────────────────────────────────────────────
  nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
  port: parseInt(getOptionalEnv('PORT', '3000'), 10),
  apiVersion: getOptionalEnv('API_VERSION', 'v1'),

  // ── Auth ──────────────────────────────────────────────────────────
  jwtSecret: getRequiredEnv('JWT_SECRET'),
  jwtExpiry: getOptionalEnv('JWT_EXPIRY', '15m'),
  jwtRefreshSecret: getRequiredEnv('JWT_REFRESH_SECRET'),
  jwtRefreshExpiry: getOptionalEnv('JWT_REFRESH_EXPIRY', '7d'),
  bcryptRounds: parseInt(getOptionalEnv('BCRYPT_ROUNDS', '10'), 10),

  // ── Redis (Phase 9) ──────────────────────────────────────────────
  // Connection URL for the Redis server (used for caching).
  // In C#, this is like your ConnectionStrings["Redis"] in appsettings.json.
  redisUrl: getOptionalEnv('REDIS_URL', 'redis://localhost:6379'),

  // Default cache TTL in seconds. Individual routes can override this.
  // Think of it like MemoryCache's AbsoluteExpirationRelativeToNow in C#.
  cacheTtl: parseInt(getOptionalEnv('CACHE_TTL', '3600'), 10),

  // ── File Uploads ──────────────────────────────────────────────────
  uploadDir: getOptionalEnv('UPLOAD_DIR', './uploads'),
  maxFileSize: parseInt(getOptionalEnv('MAX_FILE_SIZE', '5242880'), 10),
  allowedImageTypes: getOptionalEnv(
    'ALLOWED_IMAGE_TYPES',
    'image/jpeg,image/png,image/webp',
  ).split(','),

  // ── Queue / BullMQ (Phase 10) ────────────────────────────────────
  // BullMQ uses IORedis under the hood (different driver from the `redis` v5 cache client).
  // Both drivers connect to the same Redis server — they just speak different dialects.
  // In C#, this is like using both StackExchange.Redis and ServiceStack.Redis in one project.
  bullRedisUrl: getOptionalEnv('BULL_REDIS_URL', getOptionalEnv('REDIS_URL', 'redis://localhost:6379')),
  bullMaxRetries: parseInt(getOptionalEnv('BULL_MAX_RETRIES', '3'), 10),
  bullRetryBackoff: parseInt(getOptionalEnv('BULL_RETRY_BACKOFF', '1000'), 10),
  bullConcurrency: parseInt(getOptionalEnv('BULL_CONCURRENCY', '5'), 10),

  // ── Inventory Thresholds (Phase 10) ─────────────────────────────
  lowStockThreshold: parseInt(getOptionalEnv('LOW_STOCK_THRESHOLD', '10'), 10),
  abandonedCartHours: parseInt(getOptionalEnv('ABANDONED_CART_HOURS', '24'), 10),

  // ── Email / SMTP (Phase 10) ─────────────────────────────────────
  // In development, we use Ethereal (fake SMTP) so no real emails are sent.
  // Ethereal gives you a preview URL to see what the email looks like.
  // In C#, this is like using MailKit with a Papercut/smtp4dev local server.
  smtpHost: getOptionalEnv('SMTP_HOST', ''),
  smtpPort: parseInt(getOptionalEnv('SMTP_PORT', '587'), 10),
  smtpUser: getOptionalEnv('SMTP_USER', ''),
  smtpPass: getOptionalEnv('SMTP_PASS', ''),
  emailFrom: getOptionalEnv('EMAIL_FROM', 'StoreKit <noreply@storekit.dev>'),

  // ── Webhooks (Phase 11) ──────────────────────────────────────────
  // HMAC-SHA256 secret shared with the payment provider (Paystack, Stripe, etc.).
  // Used to verify incoming webhook signatures — proves the request is genuine.
  // In C#, this is like a shared secret stored in appsettings.json for webhook verification.
  // Default for dev: a dummy secret. In production, use a strong random string.
  webhookSecret: getOptionalEnv('WEBHOOK_SECRET', 'storekit-webhook-secret-change-me-in-production'),

  // Payment provider name (for logging/labelling). Not used for API calls in dev.
  paymentProvider: getOptionalEnv('PAYMENT_PROVIDER', 'mock'),

  // ── Rate Limiting (Phase 12) ──────────────────────────────────────
  // Global rate limit window and max requests per window per IP.
  //
  // The window is in milliseconds. Default: 900,000ms = 15 minutes.
  // The max is the number of requests allowed in that window.
  //
  // C# COMPARISON:
  //   In ASP.NET, you configure this in AddRateLimiter():
  //   options.AddFixedWindowLimiter("global", opt => {
  //     opt.Window = TimeSpan.FromMinutes(15);
  //     opt.PermitLimit = 100;
  //   });
  //
  // These are just the global defaults — auth routes (10/15min) and
  // strict routes (20/15min) have their own hardcoded limits.
  rateLimitWindowMs: parseInt(getOptionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  rateLimitMax: parseInt(getOptionalEnv('RATE_LIMIT_MAX', '100'), 10),

  // ── Convenience Booleans ──────────────────────────────────────────
  isDevelopment: getOptionalEnv('NODE_ENV', 'development') === 'development',
  isProduction: getOptionalEnv('NODE_ENV', 'development') === 'production',
  isTest: getOptionalEnv('NODE_ENV', 'development') === 'test',
} as const;

// Catch NODE_ENV typos at startup
const validEnvironments = ['development', 'production', 'test'] as const;
if (!validEnvironments.includes(env.nodeEnv as (typeof validEnvironments)[number])) {
  throw new Error(
    `[Config] Invalid NODE_ENV: "${env.nodeEnv}". ` +
      `Must be one of: ${validEnvironments.join(', ')}`,
  );
}

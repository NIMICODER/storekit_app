/**
 * src/config/env.ts — Environment Configuration
 *
 * PURPOSE:
 *   Load environment variables from the .env file and export them as a
 *   strongly-typed, validated configuration object.
 *
 * WHY THIS FILE EXISTS:
 *   In Node.js, environment variables live in `process.env`. The problem:
 *     1. process.env values are always `string | undefined` — no types
 *     2. If a required variable is missing, the error surfaces later
 *        (possibly deep in a request handler), not at startup
 *     3. Scattered `process.env.XYZ` calls throughout the codebase are
 *        hard to track and easy to typo
 *
 *   This file fixes all three problems:
 *     1. Exports typed values (number, boolean, string)
 *     2. Validates required variables at startup ("fail fast")
 *     3. Single source of truth — everything imports from here
 *
 * .NET EQUIVALENT:
 *   Similar to IOptions<AppSettings> + appsettings.json in ASP.NET Core.
 *   The difference: in .NET the framework does the binding/validation for you.
 *   In Node.js, we wire it up manually (or with a library like 'convict' or
 *   Zod — we'll add Zod validation in Phase 5).
 */

import dotenv from 'dotenv';

// dotenv.config() reads the .env file in the project root and loads each
// KEY=VALUE pair into process.env.
//
// This must be called BEFORE any code that reads process.env.
// That's why this file is imported early (in server.ts, before anything else).
//
// Note: In production (real servers, Docker, cloud platforms), environment
// variables are injected directly into the process — you don't need a .env file.
// dotenv is a DEVELOPMENT convenience only.
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves a REQUIRED environment variable.
 *
 * If the variable is missing or empty, throws an error immediately.
 * This is intentional "fail fast" design — a misconfigured app should
 * crash on startup with a clear error, not fail silently mid-request.
 *
 * Exported so future phases can use it when adding required vars
 * (DATABASE_URL in Phase 3, JWT_SECRET in Phase 6, etc.)
 *
 * @param key - The name of the environment variable (e.g., 'DATABASE_URL')
 * @returns The value as a string
 * @throws Error if the variable is not set
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];

  // process.env[key] is `undefined` if not set, or an empty string if set to ''
  // Both cases mean the variable isn't properly configured.
  if (value === undefined || value === '') {
    throw new Error(
      `[Config] Missing required environment variable: "${key}"\n` +
        `  → Copy .env.example to .env and fill in the required values.`,
    );
  }

  return value;
}

/**
 * Retrieves an OPTIONAL environment variable with a fallback default.
 *
 * Use this for variables that have sensible defaults and don't contain secrets.
 *
 * @param key - The name of the environment variable
 * @param defaultValue - The fallback value if the variable isn't set
 * @returns The env value or the default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  // The nullish coalescing operator (??) returns the right side only if
  // the left side is null or undefined (not for empty strings).
  // For env vars, we treat empty strings the same as missing — use || instead.
  return process.env[key] || defaultValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The application configuration, loaded once at startup.
 *
 * Usage:
 *   import { env } from './config/env';
 *   console.log(env.port);       // 3000
 *   console.log(env.isDevelopment); // true
 *
 * The `as const` assertion makes all properties readonly.
 * The config object should never be mutated at runtime — treat it
 * like a static read-only class in C#.
 */
export const env = {
  // ── Database ───────────────────────────────────────────────────────────────

  // DATABASE_URL: The PostgreSQL connection string.
  // Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA
  //
  // This is REQUIRED — the app cannot start without a database.
  // Prisma reads this from prisma.config.ts (via dotenv), but we also load it
  // here so the rest of the app can reference it (e.g., health checks, logging).
  //
  // .NET equivalent: ConnectionStrings:DefaultConnection in appsettings.json
  databaseUrl: getRequiredEnv('DATABASE_URL'),

  // ── App ──────────────────────────────────────────────────────────────────

  // NODE_ENV: Tells the app which environment it's running in.
  // Many libraries (Express, Prisma, etc.) change their behavior based on this.
  //
  // development → verbose errors, dev tools enabled, no caching
  // production  → minimal errors exposed, performance optimized
  // test        → test database, mocked external services
  nodeEnv: getOptionalEnv('NODE_ENV', 'development'),

  // PORT: The TCP port the HTTP server listens on.
  // parseInt(value, 10) converts the string '3000' to the number 3000.
  // The second argument (10) is the radix (base-10 = decimal).
  // Always specify the radix to avoid bugs with strings like '010'.
  port: parseInt(getOptionalEnv('PORT', '3000'), 10),

  // API_VERSION: Prefix for all API routes.
  // All routes will be: /api/{apiVersion}/...
  // e.g., /api/v1/products, /api/v1/auth/login
  apiVersion: getOptionalEnv('API_VERSION', 'v1'),

  // ── Auth (Phase 6) ────────────────────────────────────────────────────────

  // JWT_SECRET: The secret key used to sign ACCESS tokens.
  // REQUIRED — the app cannot start without this.
  //
  // JWTs (JSON Web Tokens) are digitally signed strings that prove identity.
  // The server signs the token with this secret on login, and verifies it on
  // every protected request. If someone doesn't know the secret, they can't
  // forge a valid token.
  //
  // SECURITY: Use a long, random string (min 32 chars). Never commit to git.
  //
  // C# equivalent: builder.Services.AddAuthentication().AddJwtBearer(options => {
  //   options.TokenValidationParameters.IssuerSigningKey =
  //     new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]));
  // });
  jwtSecret: getRequiredEnv('JWT_SECRET'),

  // JWT_EXPIRY: How long an access token is valid.
  // Short-lived (15m) so if a token is stolen, damage is limited.
  // The user refreshes with a refresh token when this expires.
  jwtExpiry: getOptionalEnv('JWT_EXPIRY', '15m'),

  // JWT_REFRESH_SECRET: SEPARATE secret for refresh tokens.
  // Why separate? If the access secret leaks (e.g., from a log), the attacker
  // still can't forge refresh tokens. Defense in depth.
  jwtRefreshSecret: getRequiredEnv('JWT_REFRESH_SECRET'),

  // JWT_REFRESH_EXPIRY: How long a refresh token is valid (default 7 days).
  // Longer than access tokens because they're stored more securely
  // (httpOnly cookies in a real app, or secure storage on mobile).
  jwtRefreshExpiry: getOptionalEnv('JWT_REFRESH_EXPIRY', '7d'),

  // BCRYPT_ROUNDS: Number of salt rounds for password hashing.
  // Higher = more secure but slower. 10 is standard for production.
  // Each +1 doubles the time: 10 ≈ 100ms, 12 ≈ 300ms, 14 ≈ 1s.
  //
  // C# equivalent: new PasswordHasher<User>(new PasswordHasherOptions {
  //   IterationCount = 100000  // .NET uses PBKDF2, not bcrypt
  // });
  bcryptRounds: parseInt(getOptionalEnv('BCRYPT_ROUNDS', '10'), 10),

  // ── Convenience Booleans ─────────────────────────────────────────────────

  // These let you write `env.isDevelopment` instead of
  // `process.env.NODE_ENV === 'development'` everywhere.
  isDevelopment: getOptionalEnv('NODE_ENV', 'development') === 'development',
  isProduction: getOptionalEnv('NODE_ENV', 'development') === 'production',
  isTest: getOptionalEnv('NODE_ENV', 'development') === 'test',
} as const;
// ^ `as const` freezes the type of this object. TypeScript infers:
//   env.port is type `number` (not `string`)
//   env.isDevelopment is type `boolean`
//   env.nodeEnv is type `string`
//   All properties are readonly — attempting to reassign throws a compile error.

// Validate the nodeEnv value is one of the expected values.
// This catches typos like NODE_ENV=developmnet.
const validEnvironments = ['development', 'production', 'test'] as const;
if (!validEnvironments.includes(env.nodeEnv as (typeof validEnvironments)[number])) {
  throw new Error(
    `[Config] Invalid NODE_ENV: "${env.nodeEnv}". ` +
      `Must be one of: ${validEnvironments.join(', ')}`,
  );
}

// Named export — import { env } from './config/env'
// (We export `env` not the default, to be explicit and allow future named exports)

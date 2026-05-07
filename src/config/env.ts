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

  // ── File Uploads ──────────────────────────────────────────────────
  uploadDir: getOptionalEnv('UPLOAD_DIR', './uploads'),
  maxFileSize: parseInt(getOptionalEnv('MAX_FILE_SIZE', '5242880'), 10),
  allowedImageTypes: getOptionalEnv(
    'ALLOWED_IMAGE_TYPES',
    'image/jpeg,image/png,image/webp',
  ).split(','),

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

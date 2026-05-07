// src/validators/auth.validator.ts — Auth Zod Schemas

import { z } from 'zod';

// ── Register Schema ──────────────────────────────────────────────────────────

/** POST /auth/register — email lowercased+trimmed, password 8-128 chars, names trimmed. */
export const registerSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email format')
    .transform((val) => val.toLowerCase().trim()),

  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),

  firstName: z
    .string({ error: 'First name is required' })
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters')
    .transform((val) => val.trim()),

  lastName: z
    .string({ error: 'Last name is required' })
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters')
    .transform((val) => val.trim()),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ── Login Schema ─────────────────────────────────────────────────────────────

/** POST /auth/login — password uses min(1) to avoid leaking password policy. */
export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email format')
    .transform((val) => val.toLowerCase().trim()),

  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ── Refresh Token Schema ─────────────────────────────────────────────────────

/** POST /auth/refresh — only checks for non-empty string; JWT validation happens in jwt.ts. */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ error: 'Refresh token is required' })
    .min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

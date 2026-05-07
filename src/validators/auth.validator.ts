/**
 * src/validators/auth.validator.ts — Zod Schemas for Auth Endpoints
 *
 * PURPOSE:
 *   Defines validation schemas for registration, login, and token refresh.
 *   These schemas are used by the validate() middleware to reject bad input
 *   BEFORE it reaches the auth controller/service.
 *
 * SCHEMA DESIGN DECISIONS:
 * ───────────────────────────────────────────────────────────────────────────
 *   Register schema:
 *     - email: required, valid format, lowercased + trimmed
 *     - password: min 8 chars (policy), max 128 (bcrypt limit)
 *     - firstName/lastName: required, trimmed
 *
 *   Login schema:
 *     - email: required, valid format, lowercased
 *     - password: min 1 char (NOT min 8!)
 *
 *     WHY min 1 for login password?
 *     If we used min(8), an attacker could send "abc" and learn from the
 *     error that our password policy requires 8+ chars. That's information
 *     leakage. On login, we just need "something was typed" — bcrypt.compare()
 *     will reject wrong passwords anyway.
 *
 *   Refresh schema:
 *     - refreshToken: required string (we don't validate JWT format here;
 *       jwt.verify() handles that)
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   // FluentValidation:
 *   public class RegisterValidator : AbstractValidator<RegisterDto> {
 *     public RegisterValidator() {
 *       RuleFor(x => x.Email).NotEmpty().EmailAddress();
 *       RuleFor(x => x.Password).MinimumLength(8).MaximumLength(128);
 *       RuleFor(x => x.FirstName).NotEmpty();
 *       RuleFor(x => x.LastName).NotEmpty();
 *     }
 *   }
 *
 *   // Or Data Annotations:
 *   public class RegisterDto {
 *     [Required, EmailAddress]
 *     public string Email { get; set; }
 *
 *     [Required, MinLength(8), MaxLength(128)]
 *     public string Password { get; set; }
 *   }
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Register Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the body of POST /auth/register.
 *
 * Transforms:
 *   - email → lowercased + trimmed (prevents "User@Email.COM" duplicates)
 *   - firstName/lastName → trimmed
 *
 * Password requirements:
 *   - Min 8 characters: NIST recommends 8+ (NIST SP 800-63B)
 *   - Max 128 characters: bcrypt has a 72-byte limit internally, but we
 *     allow up to 128 to be generous. Bcrypt silently truncates at 72 bytes.
 */
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

/**
 * TypeScript type inferred from the register schema.
 * Useful if you need to type function parameters.
 *
 * Equivalent to:
 *   { email: string; password: string; firstName: string; lastName: string; }
 */
export type RegisterInput = z.infer<typeof registerSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Login Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the body of POST /auth/login.
 *
 * SECURITY: password uses .min(1) not .min(8).
 * We don't want to leak our password policy through login validation errors.
 * If we returned "Password must be at least 8 characters" on login,
 * an attacker learns the exact policy without even having an account.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Refresh Token Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the body of POST /auth/refresh.
 *
 * We only check that refreshToken is a non-empty string.
 * The actual JWT validation (signature, expiry) happens in jwt.ts.
 * No point duplicating that logic in a Zod schema.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ error: 'Refresh token is required' })
    .min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

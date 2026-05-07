// ── JWT Utilities ────────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors';

// ── Types ────────────────────────────────────────────────────────────────────

/** Custom claims embedded in every JWT. */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/** Decoded token including standard JWT fields (iat, exp). */
export interface DecodedToken extends JwtPayload {
  iat: number;
  exp: number;
}

// ── Token Generation ─────────────────────────────────────────────────────────

/** Generate a short-lived access token. */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiry as StringValue,
  });
}

/** Generate a long-lived refresh token (uses a separate secret for defense in depth). */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiry as StringValue,
  });
}

// ── Token Verification ───────────────────────────────────────────────────────

/**
 * Verify and decode an access token.
 * @param token - JWT string from the Authorization header
 * @returns Decoded payload
 * @throws UnauthorizedError if invalid or expired
 */
export function verifyAccessToken(token: string): DecodedToken {
  try {
    return jwt.verify(token, env.jwtSecret) as DecodedToken;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Verify and decode a refresh token.
 * @param token - Refresh token from the request body
 * @returns Decoded payload
 * @throws UnauthorizedError if invalid or expired
 */
export function verifyRefreshToken(token: string): DecodedToken {
  try {
    return jwt.verify(token, env.jwtRefreshSecret) as DecodedToken;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

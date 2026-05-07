// src/middleware/authenticate.ts — JWT authentication middleware

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../errors';

/**
 * Verifies the Bearer token from the Authorization header.
 * On success, sets req.user with decoded JWT payload.
 * @throws UnauthorizedError if token is missing, malformed, or invalid
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // ── Extract token from Authorization header ────────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  // ── Verify and decode ──────────────────────────────────────────────────
  const decoded = verifyAccessToken(token);

  // ── Attach user to request ─────────────────────────────────────────────
  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  };

  next();
}

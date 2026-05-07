// src/controllers/auth.controller.ts — Authentication HTTP Controller

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess, sendCreated } from '../utils/apiResponse';

// ── Register ────────────────────────────────────────────────────────────────

/** Register a new user account and return tokens. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  sendCreated(res, result, 'Registration successful');
});

// ── Login ───────────────────────────────────────────────────────────────────

/** Authenticate with email/password and return tokens. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  sendSuccess(res, result, 'Login successful');
});

// ── Refresh ─────────────────────────────────────────────────────────────────

/** Exchange a refresh token for new access + refresh tokens (token rotation). */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshToken(refreshToken);
  sendSuccess(res, tokens, 'Tokens refreshed successfully');
});

// ── Logout ──────────────────────────────────────────────────────────────────

/** Client-side logout hint. Server-side blacklist added in Phase 9 (Redis). */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, null, 'Logged out successfully');
});

// ── Get Me ──────────────────────────────────────────────────────────────────

/** Get the currently authenticated user's profile (userId from JWT). */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // Safe to assert — authenticate middleware guarantees req.user exists
  const user = await authService.getMe(req.user!.userId);
  sendSuccess(res, user);
});

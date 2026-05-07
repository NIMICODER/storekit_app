// src/controllers/user.controller.ts — User HTTP Controller

import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  sendSuccess,
  sendPaginated,
  buildPaginationMeta,
} from '../utils/apiResponse';

// ── Get Users ───────────────────────────────────────────────────────────────

/** Get a paginated list of users. Supports `?role` and `?search` filters. */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, role, search } = req.query as unknown as {
    page: number;
    limit: number;
    role?: string;
    search?: string;
  };

  const { users, total } = await userService.getUsers({
    page,
    limit,
    role,
    search,
  });

  const meta = buildPaginationMeta(total, page, limit);
  sendPaginated(res, users, meta);
});

// ── Get User By ID ──────────────────────────────────────────────────────────

/** Get a single user by ID (password excluded). */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, user);
});

// ── Update User Profile ─────────────────────────────────────────────────────

/** Update a user's profile fields (firstName, lastName, phone, address). */
export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUserProfile(req.params.id, req.body);
  sendSuccess(res, user, 'Profile updated successfully');
});

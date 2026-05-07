// src/routes/user.routes.ts — User Route Definitions

import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUserProfile,
} from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { idParamSchema } from '../validators/common.validator';
import { updateUserProfileSchema, getUsersQuerySchema } from '../validators/user.validator';

const router = Router();

// ── Route Definitions ────────────────────────────────────────────────────────
// Middleware order: authenticate -> authorize -> validate -> controller

// Admin-only user listing
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ query: getUsersQuerySchema }),
  getUsers,
);

router.get(
  '/:id',
  authenticate,
  validate({ params: idParamSchema }),
  getUserById,
);

router.put(
  '/:id',
  authenticate,
  validate({ params: idParamSchema, body: updateUserProfileSchema }),
  updateUserProfile,
);

export default router;

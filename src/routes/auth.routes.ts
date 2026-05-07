// src/routes/auth.routes.ts — Authentication Route Definitions

import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────────

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), login);
router.post('/refresh', validate({ body: refreshTokenSchema }), refresh);

// ── Protected Routes ─────────────────────────────────────────────────────────

router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;

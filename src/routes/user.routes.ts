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

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users (ADMIN only)
 *     description: Paginated user listing with optional search and role filtering. Requires ADMIN role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [CUSTOMER, ADMIN]
 *         description: Filter by user role
 *     responses:
 *       200:
 *         description: Paginated user list
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (requires ADMIN role)
 */
// Admin-only user listing
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ query: getUsersQuerySchema }),
  getUsers,
);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     description: Returns user profile. Users can view their own profile; admins can view any.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: idParamSchema }),
  getUserById,
);

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update user profile
 *     description: Update name, phone, and address. Users can only update their own profile.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: David
 *               lastName:
 *                 type: string
 *                 example: Smith
 *               phone:
 *                 type: string
 *                 example: "+1-555-1234"
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.put(
  '/:id',
  authenticate,
  validate({ params: idParamSchema, body: updateUserProfileSchema }),
  updateUserProfile,
);

export default router;

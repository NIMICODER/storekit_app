// src/middleware/authorize.ts — Role-based authorization middleware

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors';

/**
 * Creates middleware that restricts access to specific roles. Must run after authenticate.
 * @param allowedRoles - Roles permitted to access the route
 * @returns Express middleware that checks req.user.role
 * @throws ForbiddenError if the user's role is not in the allowed list
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      );
    }

    next();
  };
}

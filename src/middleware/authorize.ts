/**
 * src/middleware/authorize.ts — Role-Based Authorization Middleware
 *
 * PURPOSE:
 *   Checks if the authenticated user has one of the allowed roles.
 *   Must run AFTER authenticate middleware (depends on req.user).
 *
 * AUTHENTICATION vs AUTHORIZATION:
 * ───────────────────────────────────────────────────────────────────────────
 *   Authentication (authenticate.ts) = "WHO are you?"
 *     → Verifies identity via JWT → sets req.user
 *
 *   Authorization (this file) = "WHAT are you allowed to do?"
 *     → Checks req.user.role against a whitelist
 *
 *   They always run in order:
 *     authenticate → authorize → controller
 *     (identity)    (permission)  (action)
 *
 * FACTORY PATTERN:
 * ───────────────────────────────────────────────────────────────────────────
 *   authorize() is a FACTORY — it returns a middleware function.
 *   This lets you configure which roles are allowed per route:
 *
 *     authorize('ADMIN')                → only admins
 *     authorize('ADMIN', 'CUSTOMER')    → admins OR customers
 *
 *   Same pattern as validate() — a function that returns middleware.
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   // ASP.NET attribute-based authorization:
 *   [Authorize(Roles = "ADMIN")]
 *   public IActionResult GetAllUsers() { ... }
 *
 *   [Authorize(Roles = "ADMIN,CUSTOMER")]
 *   public IActionResult GetProfile() { ... }
 *
 *   // Or policy-based:
 *   [Authorize(Policy = "AdminOnly")]
 *   public IActionResult DeleteUser() { ... }
 *
 *   The [Authorize(Roles = "ADMIN")] attribute does EXACTLY what our
 *   authorize('ADMIN') middleware does — check the user's role claim
 *   against the allowed list.
 *
 * USAGE IN ROUTES:
 *   import { authenticate } from '../middleware/authenticate';
 *   import { authorize } from '../middleware/authorize';
 *
 *   // Admin-only route:
 *   router.get('/users', authenticate, authorize('ADMIN'), getUsers);
 *
 *   // Any authenticated user:
 *   router.get('/me', authenticate, getMe);  // no authorize needed
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors';

/**
 * Creates authorization middleware that restricts access to specific roles.
 *
 * @param allowedRoles - One or more role strings that are allowed access
 * @returns Express middleware that checks req.user.role
 * @throws ForbiddenError (403) if the user's role is not in the allowed list
 *
 * The spread operator (...) lets you pass roles as individual arguments:
 *   authorize('ADMIN')              → allowedRoles = ['ADMIN']
 *   authorize('ADMIN', 'CUSTOMER')  → allowedRoles = ['ADMIN', 'CUSTOMER']
 *
 * C# equivalent:
 *   public class RoleAuthorizationFilter : IAuthorizationFilter {
 *     private readonly string[] _roles;
 *     public RoleAuthorizationFilter(params string[] roles) => _roles = roles;
 *     public void OnAuthorization(AuthorizationFilterContext context) {
 *       var userRole = context.HttpContext.User.FindFirst(ClaimTypes.Role)?.Value;
 *       if (!_roles.Contains(userRole))
 *         context.Result = new ForbidResult();
 *     }
 *   }
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // req.user is set by authenticate middleware.
    // If we reach here without req.user, it means authorize was used
    // without authenticate — that's a programming error.
    const userRole = req.user?.role;

    // Check if the user's role is in the allowed list.
    // Array.includes() does a simple equality check against each element.
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      );
    }

    // User has an allowed role — proceed to the next middleware/controller.
    next();
  };
}

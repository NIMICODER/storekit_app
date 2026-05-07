/**
 * src/types/express.d.ts — Express Type Augmentation
 *
 * PURPOSE:
 *   Extend Express's built-in `Request` type to include custom properties
 *   that our middleware will attach to every request object.
 *
 * HOW TYPESCRIPT DECLARATION MERGING WORKS:
 * ──────────────────────────────────────────
 * TypeScript allows you to "re-open" an existing interface and add properties
 * to it. This is called Declaration Merging.
 *
 * Express's `Request` interface lives inside the `Express` namespace in the
 * `express-serve-static-core` module. By declaring the same namespace + interface
 * here, TypeScript merges them — adding our custom properties to EVERY `Request`
 * object in the entire project.
 *
 * After this file:
 *   req.requestId  → string | undefined  (TypeScript knows it exists)
 *   req.startTime  → number | undefined  (TypeScript knows it exists)
 *
 * Without this file:
 *   req.requestId  → TypeScript error: Property 'requestId' does not exist on type 'Request'
 *
 * C# EQUIVALENT:
 *   This is similar to extension methods in C# — adding properties/methods to
 *   an existing type you don't own. The difference: TypeScript does it at the
 *   TYPE level (compile-time only), not at runtime.
 *
 * TECHNICAL NOTE:
 *   The `export {};` below makes this file a MODULE (rather than a "script").
 *   In TypeScript, `declare global { }` can only be used inside a module file.
 *   A file is a module if it has at least one import or export statement.
 *   The empty export is the minimal way to make this a module.
 */

// Makes this file a TypeScript module (required for `declare global` below)
export {};

declare global {
  // We augment Express's global namespace.
  // Express reads type extensions from this `Express` namespace automatically.
  namespace Express {
    interface Request {
      /**
       * A unique ID for this HTTP request.
       * Set by requestLogger middleware on every incoming request.
       *
       * Used for:
       *   - Correlating log entries (all logs for one request share the same ID)
       *   - Debugging (clients can include this in bug reports)
       *   - Tracing across distributed systems (Phase 14)
       *
       * We use `crypto.randomUUID()` which generates a UUID v4:
       * e.g., "550e8400-e29b-41d4-a716-446655440000"
       *
       * Optional because it's only set after requestLogger runs.
       * Before that middleware executes, the property doesn't exist.
       */
      requestId?: string;

      /**
       * Timestamp (milliseconds since epoch) when the request arrived.
       * Set by requestLogger to calculate response duration.
       *
       * Usage:
       *   const duration = Date.now() - req.startTime;  // e.g., 45ms
       *
       * Optional for the same reason as requestId.
       */
      startTime?: number;

      /**
       * Authenticated user info, extracted from a valid JWT by the
       * authenticate middleware (Phase 6).
       *
       * Set by: src/middleware/authenticate.ts
       * Used by: authorize middleware, controllers (req.user!.userId)
       *
       * Optional because it only exists on PROTECTED routes
       * (routes that use the authenticate middleware).
       * On public routes (login, register), req.user is undefined.
       *
       * C# equivalent:
       *   HttpContext.User.FindFirst("userId")?.Value
       *   HttpContext.User.FindFirst(ClaimTypes.Email)?.Value
       *   HttpContext.User.FindFirst(ClaimTypes.Role)?.Value
       */
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

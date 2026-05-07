/**
 * src/errors/index.ts — Barrel Export for All Error Classes
 *
 * PURPOSE:
 *   Lets you import all error classes from a single path:
 *     import { NotFoundError, ConflictError, ValidationError } from '../errors';
 *
 *   Instead of importing each one from its own file:
 *     import { NotFoundError } from '../errors/NotFoundError';
 *     import { ConflictError } from '../errors/ConflictError';
 *
 * C# EQUIVALENT:
 *   A namespace that contains all exception classes:
 *     using StoreKit.Exceptions; // gives you NotFoundError, ConflictError, etc.
 *
 * BARREL EXPORT PATTERN:
 *   This is a very common Node.js/TypeScript pattern.
 *   An index.ts file in a directory re-exports everything from that directory.
 *   When you import from a directory, Node.js looks for index.ts automatically:
 *     import { ... } from '../errors'  →  resolves to ../errors/index.ts
 */

export { AppError } from './AppError';
export { NotFoundError } from './NotFoundError';
export { ConflictError } from './ConflictError';
export { ValidationError } from './ValidationError';
export type { ValidationDetail } from './ValidationError';
export { BadRequestError } from './BadRequestError';
export { UnauthorizedError } from './UnauthorizedError';
export { ForbiddenError } from './ForbiddenError';

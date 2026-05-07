/**
 * src/repositories/user.repository.ts — User Data Access Layer
 *
 * PURPOSE:
 *   Handles ALL database interactions for the User model.
 *   Extends BaseRepository with user-specific query methods.
 *
 * SECURITY — PASSWORD EXCLUSION:
 * ───────────────────────────────────────────────────────────────────────────
 *   The password hash should NEVER be sent to the API consumer.
 *   Even though it's hashed (with bcrypt in Phase 6), sending it:
 *     1. Increases attack surface (offline brute-force attempts)
 *     2. Violates the principle of least privilege
 *     3. Is a data leak if the response is logged/cached
 *
 *   We use Prisma's `omit` to exclude the password from ALL queries.
 *   This is a Prisma v5.13+ feature — it's like a "never select this field" rule.
 *
 *   C# equivalent:
 *     _dbSet.Select(u => new UserDto {
 *       Id = u.Id,
 *       Email = u.Email,
 *       // deliberately NOT mapping Password
 *     });
 *
 *   Or using AutoMapper with a profile that ignores the Password property.
 *
 * NOTE ON AUTH METHODS (Phase 6):
 *   Two new methods were added for the auth layer:
 *     - findByEmailWithPassword() — returns the FULL user including password hash.
 *       Used ONLY by auth service for login verification. Never exposed via API.
 *     - createUser() — creates a new user with a pre-hashed password.
 *       Returns the user WITHOUT the password (safe for API response).
 */

import { BaseRepository } from './base.repository';
import prisma from '../config/database';
import type { Prisma } from '../generated/prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types for user queries
// ─────────────────────────────────────────────────────────────────────────────

export interface FindAllPaginatedParams {
  page: number;
  limit: number;
  role?: string;
  search?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Repository Class
// ─────────────────────────────────────────────────────────────────────────────

class UserRepository extends BaseRepository {
  constructor() {
    super(prisma.user);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User-Specific READ Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find a user by ID, WITHOUT the password field.
   *
   * Overrides the base findById to always omit the password.
   * Every consumer of this method gets a safe user object.
   *
   * @param id - The user's UUID
   * @returns User without password, or null if not found
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });
  }

  /**
   * Find a user by their email address, WITHOUT the password field.
   *
   * Email has a @unique constraint, so this is a fast index lookup.
   * Used for: checking if email is already taken, looking up user profiles.
   *
   * C# equivalent:
   *   _dbSet.Where(u => u.Email == email)
   *         .Select(u => new UserDto { ... })  // without password
   *         .FirstOrDefaultAsync();
   */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      omit: { password: true },
    });
  }

  /**
   * Find a user by email INCLUDING the password hash.
   *
   * ⚠️ AUTH-ONLY METHOD — NEVER expose the result via API.
   *
   * This exists because login verification needs to:
   *   1. Look up the user by email
   *   2. Compare the submitted password against the stored hash
   *
   * bcrypt.compare() needs the hash, so we can't omit it here.
   * The auth service calls this internally, then strips the password
   * before returning data to the controller.
   *
   * Why a separate method instead of a flag on findByEmail()?
   *   Making it a distinct method with a scary name ("WithPassword")
   *   makes it obvious at call sites that this returns sensitive data.
   *   A flag like findByEmail(email, { includePassword: true }) is
   *   easier to misuse accidentally.
   *
   * C# equivalent:
   *   // In the auth service:
   *   var user = await _dbSet.FirstOrDefaultAsync(u => u.Email == email);
   *   // user.PasswordHash is available for verification
   */
  async findByEmailWithPassword(email: string) {
    return prisma.user.findUnique({
      where: { email },
      // No `omit` — we intentionally include ALL fields including password
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User-Specific WRITE Methods (Phase 6)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new user in the database.
   *
   * The password should ALREADY be hashed (by the auth service using bcrypt)
   * before calling this method. This repository doesn't know about hashing —
   * it just stores whatever password string it receives.
   *
   * Returns the created user WITHOUT the password (safe for API response).
   *
   * @param data - User data with pre-hashed password
   * @returns Created user (password omitted)
   *
   * C# equivalent:
   *   public async Task<UserDto> CreateAsync(CreateUserDto dto) {
   *     var user = new User {
   *       Email = dto.Email,
   *       Password = dto.Password,  // already hashed by service
   *       FirstName = dto.FirstName,
   *       LastName = dto.LastName,
   *       Role = dto.Role ?? Role.CUSTOMER
   *     };
   *     _dbSet.Add(user);
   *     await _context.SaveChangesAsync();
   *     return _mapper.Map<UserDto>(user);  // without password
   *   }
   */
  async createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        // Default role is CUSTOMER (set in Prisma schema),
        // but allow override for admin creation
        ...(data.role && { role: data.role as 'ADMIN' | 'CUSTOMER' }),
      },
      omit: { password: true }, // Don't return the password hash
    });
  }

  /**
   * Find all users with pagination, role filtering, and search.
   *
   * This is an ADMIN-ONLY endpoint (enforced in Phase 6 with JWT + role check).
   * Admins need to:
   *   - Browse all users (paginated)
   *   - Filter by role (show only ADMIN or CUSTOMER)
   *   - Search by name or email
   *
   * @param params - Pagination + filter parameters
   * @returns { users: User[], total: number }
   *
   * C# equivalent:
   *   var query = _dbSet.AsQueryable();
   *   if (role != null) query = query.Where(u => u.Role == role);
   *   if (search != null) query = query.Where(u =>
   *     u.FirstName.Contains(search) ||
   *     u.LastName.Contains(search) ||
   *     u.Email.Contains(search));
   *   var total = await query.CountAsync();
   *   var users = await query.Skip(skip).Take(limit).ToListAsync();
   */
  async findAllPaginated(params: FindAllPaginatedParams) {
    const { page, limit, role, search } = params;

    // Build WHERE clause dynamically — same pattern as product repository
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Role filter — "show me only admins" or "show me only customers"
    if (role) {
      where.role = role;
    }

    // Text search — search across firstName, lastName, and email
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    // Run both queries in parallel (same pattern as product repository)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        omit: { password: true }, // NEVER return passwords
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Update a user's PROFILE fields only.
   *
   * This method restricts which fields can be updated:
   *   ALLOWED: firstName, lastName, phone, address
   *   NOT ALLOWED: email, password, role
   *
   * Why restrict?
   *   - email change needs verification (Phase 6)
   *   - password change needs old password verification (Phase 6)
   *   - role change is admin-only (Phase 6)
   *
   * C# equivalent:
   *   public class UpdateProfileDto {
   *     public string? FirstName { get; set; }
   *     public string? LastName { get; set; }
   *     public string? Phone { get; set; }
   *     public JsonElement? Address { get; set; }
   *   }
   *   // Only these properties get mapped to the entity
   */
  async updateProfile(id: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: Prisma.InputJsonValue;
  }) {
    return prisma.user.update({
      where: { id },
      data,
      omit: { password: true }, // Don't return password in the result
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const userRepository = new UserRepository();

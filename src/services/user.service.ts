/**
 * src/services/user.service.ts — User Business Logic Layer
 *
 * PURPOSE:
 *   Contains business logic for user operations.
 *   Currently limited to READ + profile UPDATE (no create/delete).
 *
 * WHY NO createUser / deleteUser?
 * ───────────────────────────────────────────────────────────────────────────
 *   - createUser → handled by Phase 6 (Auth): register endpoint with password
 *     hashing via bcrypt, email verification, etc.
 *   - deleteUser → not implemented yet. Deleting users with orders requires
 *     careful handling (the Prisma schema uses onDelete: Restrict on orders).
 *
 * SECURITY NOTE:
 *   All user data returned by this service has the password OMITTED.
 *   The repository layer handles this via Prisma's `omit: { password: true }`.
 *
 * ERROR HANDLING (Phase 5):
 * ───────────────────────────────────────────────────────────────────────────
 *   Now uses NotFoundError instead of (error as any).statusCode hacks.
 *
 * C# EQUIVALENT:
 *   public class UserService : IUserService {
 *     private readonly IUserRepository _userRepo;
 *     // ... profile operations only
 *   }
 */

import { userRepository } from '../repositories/user.repository';
import type { FindAllPaginatedParams } from '../repositories/user.repository';
import type { Prisma } from '../generated/prisma/client';
import { NotFoundError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// User Service Class
// ─────────────────────────────────────────────────────────────────────────────

class UserService {
  constructor(
    private userRepo: typeof userRepository,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // READ Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a paginated list of users, with optional filtering.
   *
   * This is an admin-facing operation (Phase 6 will add role-based access).
   * Supports:
   *   - Pagination (page + limit)
   *   - Role filter (ADMIN / CUSTOMER)
   *   - Text search (name + email)
   *
   * @param params - Pagination + filter parameters
   * @returns { users, total }
   */
  async getUsers(params: FindAllPaginatedParams) {
    return this.userRepo.findAllPaginated(params);
  }

  /**
   * Get a single user by their UUID.
   *
   * @param id - User UUID
   * @returns User without password
   * @throws NotFoundError if user not found
   */
  async getUserById(id: string) {
    const user = await this.userRepo.findById(id);

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return user;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update a user's profile fields.
   *
   * Only allows updating: firstName, lastName, phone, address.
   * Does NOT allow changing: email, password, role (those need auth logic).
   *
   * @param id   - User UUID
   * @param data - Profile fields to update
   * @returns Updated user (without password)
   * @throws NotFoundError if user not found
   *
   * C# equivalent:
   *   public async Task<UserDto> UpdateProfileAsync(Guid id, UpdateProfileDto dto) {
   *     var user = await _userRepo.FindByIdAsync(id)
   *       ?? throw new NotFoundException("User", id);
   *     // map allowed fields only
   *     user.FirstName = dto.FirstName ?? user.FirstName;
   *     return mapper.Map<UserDto>(await _userRepo.UpdateAsync(user));
   *   }
   */
  async updateUserProfile(id: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: Prisma.InputJsonValue;
  }) {
    // Verify user exists
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('User', id);
    }

    return this.userRepo.updateProfile(id, data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const userService = new UserService(userRepository);

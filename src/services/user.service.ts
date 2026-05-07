// src/services/user.service.ts — User Business Logic

import { userRepository } from '../repositories/user.repository';
import type { FindAllPaginatedParams } from '../repositories/user.repository';
import type { Prisma } from '../generated/prisma/client';
import { NotFoundError } from '../errors';

// ── User Service ─────────────────────────────────────────────────────────────

class UserService {
  constructor(
    private userRepo: typeof userRepository,
  ) {}

  // ── Read Operations ──────────────────────────────────────────────────────

  /** Get a paginated list of users with optional role/search filtering. */
  async getUsers(params: FindAllPaginatedParams) {
    return this.userRepo.findAllPaginated(params);
  }

  /**
   * @param id - User UUID
   * @throws NotFoundError if user not found
   */
  async getUserById(id: string) {
    const user = await this.userRepo.findById(id);

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return user;
  }

  // ── Write Operations ─────────────────────────────────────────────────────

  /**
   * Update profile fields only (firstName, lastName, phone, address).
   * Email, password, and role changes require auth-specific flows.
   * @throws NotFoundError if user not found
   */
  async updateUserProfile(id: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: Prisma.InputJsonValue;
  }) {
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('User', id);
    }

    return this.userRepo.updateProfile(id, data);
  }
}

// ── Export Singleton ──────────────────────────────────────────────────────────

export const userService = new UserService(userRepository);

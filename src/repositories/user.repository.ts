// ── User Repository ─────────────────────────────────────────────────────────
// Data access for the User model. Password is omitted from all responses
// except findByEmailWithPassword() (used only by auth service for login).

import { BaseRepository } from './base.repository';
import prisma from '../config/database';
import type { Prisma } from '../generated/prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FindAllPaginatedParams {
  page: number;
  limit: number;
  role?: string;
  search?: string;
}

// ── User Repository Class ─────────────────────────────────────────────────────

class UserRepository extends BaseRepository {
  constructor() {
    super(prisma.user);
  }

  // ── Read Methods ────────────────────────────────────────────────────────

  /** Find user by ID, password omitted. */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });
  }

  /** Find user by email, password omitted. */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      omit: { password: true },
    });
  }

  /** Find user by email WITH password hash. Auth-only — never expose via API. */
  async findByEmailWithPassword(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  // ── Write Methods ───────────────────────────────────────────────────────

  /**
   * Create a new user. Password must already be hashed by the caller.
   * @returns Created user (password omitted)
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
        ...(data.role && { role: data.role as 'ADMIN' | 'CUSTOMER' }),
      },
      omit: { password: true },
    });
  }

  /**
   * Find all users with pagination, optional role filter, and text search.
   * @returns { users, total }
   */
  async findAllPaginated(params: FindAllPaginatedParams) {
    const { page, limit, role, search } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        omit: { password: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Update profile fields only (firstName, lastName, phone, address).
   * Sensitive fields (email, password, role) require separate flows.
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
      omit: { password: true },
    });
  }
}

// ── Export Singleton ───────────────────────────────────────────────────────────

export const userRepository = new UserRepository();

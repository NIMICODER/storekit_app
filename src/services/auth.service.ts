// src/services/auth.service.ts — Authentication Business Logic

import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../utils/jwt';
import { ConflictError, UnauthorizedError, NotFoundError } from '../errors';

// ── Auth Service ─────────────────────────────────────────────────────────────

class AuthService {
  constructor(
    private userRepo: typeof userRepository,
  ) {}

  // ── Register ─────────────────────────────────────────────────────────────

  /**
   * Register a new user account.
   * @returns { user, accessToken, refreshToken }
   * @throws ConflictError if email already exists
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    // Check email uniqueness before insert for a clear error message
    const existingUser = await this.userRepo.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('A user with this email already exists');
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await this.userRepo.createUser({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  // ── Login ────────────────────────────────────────────────────────────────

  /**
   * Authenticate with email + password.
   * Uses identical error messages for "not found" and "wrong password" to prevent enumeration.
   * @returns { user, accessToken, refreshToken }
   * @throws UnauthorizedError if credentials are invalid
   */
  async login(email: string, password: string) {
    const user = await this.userRepo.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Strip password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  // ── Refresh Token ────────────────────────────────────────────────────────

  /**
   * Exchange a valid refresh token for new access + refresh tokens (token rotation).
   * @returns { accessToken, refreshToken }
   * @throws UnauthorizedError if token is invalid/expired or user no longer exists
   */
  async refreshToken(token: string) {
    const decoded = verifyRefreshToken(token);

    // Ensure the user wasn't deleted since the token was issued
    const user = await this.userRepo.findById(decoded.userId);

    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      accessToken,
      refreshToken,
    };
  }

  // ── Get Current User ─────────────────────────────────────────────────────

  /**
   * Get the authenticated user's profile. userId comes from the JWT, not a URL param.
   * @throws NotFoundError if user not found (rare — means JWT references a deleted user)
   */
  async getMe(userId: string) {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  }
}

// ── Export Singleton ──────────────────────────────────────────────────────────

export const authService = new AuthService(userRepository);

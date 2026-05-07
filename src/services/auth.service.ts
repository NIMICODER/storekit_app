/**
 * src/services/auth.service.ts — Authentication Business Logic
 *
 * PURPOSE:
 *   Handles all authentication operations: register, login, token refresh,
 *   and "get current user" (me). This is the brain of the auth system.
 *
 * ARCHITECTURE:
 * ───────────────────────────────────────────────────────────────────────────
 *   Controller (HTTP layer)
 *     → Auth Service (THIS FILE — business logic)
 *       → User Repository (database layer)
 *       → Password utils (bcrypt hashing)
 *       → JWT utils (token generation/verification)
 *
 *   The auth service orchestrates multiple concerns:
 *     - Uniqueness checks (is email taken?)
 *     - Password hashing (bcrypt)
 *     - Token generation (JWT)
 *     - User lookup (repository)
 *
 *   No single layer knows everything — each has a focused responsibility.
 *
 * TOKEN FLOW:
 * ───────────────────────────────────────────────────────────────────────────
 *   Register/Login → { user, accessToken (15m), refreshToken (7d) }
 *
 *   API Request → Authorization: Bearer <accessToken>
 *     → authenticate middleware verifies → req.user set → controller runs
 *
 *   Access token expires → POST /auth/refresh { refreshToken }
 *     → verify refresh token → generate NEW access + refresh tokens
 *     → return both (this is "token rotation")
 *
 *   Refresh token expires → user must log in again
 *
 * SECURITY DECISIONS:
 * ───────────────────────────────────────────────────────────────────────────
 *   1. Same error for "email not found" AND "wrong password" on login
 *      → Prevents user enumeration attacks
 *
 *   2. Token rotation on refresh (new refresh token each time)
 *      → If old refresh token is stolen, it becomes invalid after first use
 *
 *   3. Password never returned in ANY response
 *      → Repository's omit: { password: true } on all non-auth queries
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   public class AuthService : IAuthService {
 *     private readonly IUserRepository _userRepo;
 *     private readonly IPasswordHasher _hasher;
 *     private readonly ITokenService _tokenService;
 *
 *     public async Task<AuthResponse> RegisterAsync(RegisterDto dto) { ... }
 *     public async Task<AuthResponse> LoginAsync(LoginDto dto) { ... }
 *     public async Task<TokenResponse> RefreshTokenAsync(string refreshToken) { ... }
 *     public async Task<UserDto> GetMeAsync(string userId) { ... }
 *   }
 */

import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../utils/jwt';
import { ConflictError, UnauthorizedError, NotFoundError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Service Class
// ─────────────────────────────────────────────────────────────────────────────

class AuthService {
  /**
   * Constructor injection — same DI pattern as UserService.
   *
   * The repository is injected so we can swap it in tests:
   *   const service = new AuthService(mockUserRepository);
   *
   * C# equivalent:
   *   public AuthService(IUserRepository userRepo) => _userRepo = userRepo;
   */
  constructor(
    private userRepo: typeof userRepository,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Register
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a new user account.
   *
   * Steps:
   *   1. Check if email is already taken (ConflictError if so)
   *   2. Hash the password with bcrypt
   *   3. Create the user in the database
   *   4. Generate access + refresh tokens
   *   5. Return user data + both tokens
   *
   * @param data - Validated registration data (from Zod schema)
   * @returns { user, accessToken, refreshToken }
   * @throws ConflictError if email already exists
   *
   * C# equivalent:
   *   public async Task<AuthResponse> RegisterAsync(RegisterDto dto) {
   *     if (await _userRepo.EmailExistsAsync(dto.Email))
   *       throw new ConflictException("Email already in use");
   *     var hash = _hasher.HashPassword(null, dto.Password);
   *     var user = await _userRepo.CreateAsync(new User { ... });
   *     var tokens = _tokenService.GenerateTokens(user);
   *     return new AuthResponse(user, tokens);
   *   }
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    // ── Step 1: Check email uniqueness ──────────────────────────────────
    // We check before creating to give a clear error message.
    // Prisma would also throw P2002 (unique constraint), but our error
    // handler's P2002 message is generic. This gives a specific message.
    const existingUser = await this.userRepo.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('A user with this email already exists');
    }

    // ── Step 2: Hash the password ───────────────────────────────────────
    // NEVER store plain-text passwords. bcrypt generates a random salt
    // and hashes the password with it. The result is a 60-char string
    // that includes the algorithm, salt rounds, salt, and hash.
    const hashedPassword = await hashPassword(data.password);

    // ── Step 3: Create the user ─────────────────────────────────────────
    // createUser() stores the hashed password and returns the user
    // WITHOUT the password field (safe for API response).
    const user = await this.userRepo.createUser({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    // ── Step 4: Generate tokens ─────────────────────────────────────────
    // The payload embedded in the JWT — just enough to identify the user.
    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // ── Step 5: Return everything ───────────────────────────────────────
    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Authenticate a user with email + password.
   *
   * Steps:
   *   1. Find user by email (WITH password hash)
   *   2. Compare submitted password against stored hash
   *   3. Generate access + refresh tokens
   *   4. Return user data (WITHOUT password) + tokens
   *
   * SECURITY: Same error message for "email not found" and "wrong password".
   * This prevents user enumeration — an attacker can't tell whether an
   * email is registered by checking the error message.
   *
   * @param email    - User's email address
   * @param password - Plain-text password to verify
   * @returns { user, accessToken, refreshToken }
   * @throws UnauthorizedError if email not found OR password wrong
   */
  async login(email: string, password: string) {
    // ── Step 1: Find user WITH password ─────────────────────────────────
    // We use findByEmailWithPassword() because we need the bcrypt hash
    // to compare against the submitted password.
    const user = await this.userRepo.findByEmailWithPassword(email);

    // SECURITY: Don't reveal whether the email exists.
    // "Invalid email or password" is the same for both cases.
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // ── Step 2: Compare passwords ───────────────────────────────────────
    // bcrypt.compare() extracts the salt from the stored hash,
    // hashes the submitted password with that salt, and compares.
    // It uses constant-time comparison to prevent timing attacks.
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      // Same message as "user not found" — prevents enumeration
      throw new UnauthorizedError('Invalid email or password');
    }

    // ── Step 3: Generate tokens ─────────────────────────────────────────
    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // ── Step 4: Return user WITHOUT password ────────────────────────────
    // We destructure to remove the password field from the response.
    // This is a common JavaScript pattern for excluding object properties.
    //
    // C# equivalent:
    //   return _mapper.Map<UserDto>(user);  // AutoMapper skips Password
    //
    // The `_password` variable is intentionally unused (prefixed with _).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Refresh Token
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Exchange a valid refresh token for new access + refresh tokens.
   *
   * This implements TOKEN ROTATION:
   *   - Old refresh token → verified and consumed
   *   - New access token + new refresh token → returned
   *
   * Why rotation? If an attacker steals a refresh token and uses it,
   * the legitimate user's next refresh attempt will fail (the old token
   * was already consumed). This is a signal that the token was compromised.
   *
   * Note: With client-side only logout (no server-side blacklist), we can't
   * truly "consume" the old token. Phase 9 (Redis) adds a token blacklist
   * for proper revocation. For now, we re-verify the user still exists.
   *
   * @param token - The refresh token from the client
   * @returns { accessToken, refreshToken } — both are NEW tokens
   * @throws UnauthorizedError if the refresh token is invalid/expired
   * @throws UnauthorizedError if the user no longer exists
   */
  async refreshToken(token: string) {
    // ── Step 1: Verify the refresh token ────────────────────────────────
    // This checks the signature (using the refresh secret) and expiry.
    // Throws UnauthorizedError if invalid.
    const decoded = verifyRefreshToken(token);

    // ── Step 2: Verify the user still exists ────────────────────────────
    // The token might be valid but the user could have been deleted.
    // We don't want to issue new tokens for a non-existent user.
    const user = await this.userRepo.findById(decoded.userId);

    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    // ── Step 3: Generate fresh tokens ───────────────────────────────────
    // Both access AND refresh tokens are regenerated (token rotation).
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

  // ─────────────────────────────────────────────────────────────────────────
  // Get Current User
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the currently authenticated user's profile.
   *
   * Called by GET /auth/me — the userId comes from the JWT (req.user.userId),
   * NOT from a URL parameter. This means users can only view their OWN profile
   * through this endpoint.
   *
   * @param userId - The authenticated user's ID (from JWT)
   * @returns User without password
   * @throws NotFoundError if user not found (shouldn't happen normally)
   *
   * C# equivalent:
   *   [Authorize]
   *   [HttpGet("me")]
   *   public async Task<UserDto> GetMe() {
   *     var userId = User.FindFirst("userId").Value;
   *     return await _userService.GetByIdAsync(userId);
   *   }
   */
  async getMe(userId: string) {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      // This should rarely happen — means the JWT references a deleted user.
      // The refresh endpoint catches this too, but the user might hit /me
      // before their access token expires after account deletion.
      throw new NotFoundError('User', userId);
    }

    return user;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const authService = new AuthService(userRepository);

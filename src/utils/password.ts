/**
 * src/utils/password.ts — Password Hashing Utilities
 *
 * PURPOSE:
 *   Wraps bcrypt operations for password hashing and comparison.
 *   Used by the auth service during registration and login.
 *
 * WHY BCRYPT?
 * ───────────────────────────────────────────────────────────────────────────
 *   Bcrypt is a password hashing algorithm designed to be SLOW on purpose.
 *   Unlike SHA-256 (which hashes billions per second), bcrypt is intentionally
 *   expensive — making brute-force attacks impractical.
 *
 *   How it works:
 *     1. Generate a random "salt" (unique per password)
 *     2. Hash the password + salt using the Blowfish cipher
 *     3. Repeat step 2 many times (controlled by "rounds" / cost factor)
 *     4. Store the result: "$2b$10$salt...hash..." (includes algorithm, rounds, salt)
 *
 *   The stored hash contains EVERYTHING needed to verify later:
 *     "$2b$10$N9qo8uLOickgx2ZMRZoMye.IjqdkPEqU..."
 *      │  │  │                        │
 *      │  │  └─ 22-char salt          └─ 31-char hash
 *      │  └─ 10 rounds (2^10 = 1024 iterations)
 *      └─ bcrypt version 2b
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   ASP.NET Core uses PBKDF2 by default (different algorithm, same idea):
 *
 *     var hasher = new PasswordHasher<User>();
 *     string hash = hasher.HashPassword(user, plainPassword);
 *     var result = hasher.VerifyHashedPassword(user, hash, plainPassword);
 *     // result == PasswordVerificationResult.Success
 *
 *   Or with BCrypt.Net-Next NuGet package:
 *     string hash = BCrypt.Net.BCrypt.HashPassword(plainPassword, workFactor: 10);
 *     bool valid = BCrypt.Net.BCrypt.Verify(plainPassword, hash);
 *
 * SECURITY NOTES:
 *   - NEVER store plain-text passwords
 *   - NEVER use MD5 or SHA-256 for passwords (too fast to brute-force)
 *   - NEVER log passwords, even hashed ones
 *   - Salt is auto-generated per password — no two users have the same hash
 *     even if they use the same password
 */

import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * Hash a plain-text password using bcrypt.
 *
 * Steps:
 *   1. genSalt(rounds) — generates a random salt with the given cost factor
 *   2. hash(password, salt) — hashes the password with that salt
 *
 * The result is a single string containing the algorithm, cost, salt, AND hash.
 * This means you don't need to store the salt separately.
 *
 * @param plain - The user's plain-text password
 * @returns The bcrypt hash string (60 chars, includes salt)
 *
 * C# equivalent:
 *   return BCrypt.Net.BCrypt.HashPassword(plain, workFactor: 10);
 */
export async function hashPassword(plain: string): Promise<string> {
  // genSalt() generates a random salt.
  // The rounds parameter (default: 10) controls how expensive the hash is.
  // Each +1 doubles computation time: 10 ≈ 100ms, 12 ≈ 300ms, 14 ≈ 1s
  const salt = await bcrypt.genSalt(env.bcryptRounds);

  // hash() combines the password with the salt and runs the bcrypt algorithm.
  // The result includes the salt, so we only need to store this one string.
  return bcrypt.hash(plain, salt);
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 *
 * How it works internally:
 *   1. Extract the salt from the stored hash (it's embedded in the string)
 *   2. Hash the plain-text password with that same salt
 *   3. Compare the two hashes (constant-time comparison to prevent timing attacks)
 *
 * @param plain - The password the user just typed in
 * @param hash  - The stored bcrypt hash from the database
 * @returns true if the password matches, false otherwise
 *
 * C# equivalent:
 *   return BCrypt.Net.BCrypt.Verify(plain, hash);
 */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  // bcrypt.compare() handles everything:
  //   - Extracts salt from the hash string
  //   - Hashes the plain password with that salt
  //   - Compares using constant-time equality (prevents timing attacks)
  return bcrypt.compare(plain, hash);
}

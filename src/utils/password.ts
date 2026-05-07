// ── Password Hashing Utilities ───────────────────────────────────────────────

import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** Hash a plain-text password using bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(env.bcryptRounds);
  return bcrypt.hash(plain, salt);
}

/** Compare a plain-text password against a stored bcrypt hash. */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

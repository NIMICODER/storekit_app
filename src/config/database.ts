// ── src/config/database.ts ── Prisma Client Singleton ───────────────

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env';

// Allow self-signed SSL certs for cloud-hosted PostgreSQL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── Global Type Declaration ─────────────────────────────────────────
// Survives hot-reloads in development (var required for global scope)

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// ── Client Factory ──────────────────────────────────────────────────

/** Creates a PrismaClient with the pg driver adapter (required in Prisma v7). */
function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: env.isDevelopment
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  });
}

// ── Singleton Instance ──────────────────────────────────────────────
// Reuses global instance in dev to avoid connection leaks across hot-reloads

const prisma: PrismaClient = globalThis.prisma ?? createPrismaClient();

if (env.isDevelopment) {
  globalThis.prisma = prisma;
}

// ── Lifecycle ───────────────────────────────────────────────────────

/** Opens the connection pool. Call at startup for fail-fast validation. @throws If DB is unreachable. */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[Database] Connected to PostgreSQL');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Database] Failed to connect:', error);
    throw error;
  }
}

/** Closes all pool connections cleanly. Call during graceful shutdown. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('[Database] Disconnected from PostgreSQL');
}

// ── Export ───────────────────────────────────────────────────────────

export default prisma;

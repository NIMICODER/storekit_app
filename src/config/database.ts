/**
 * src/config/database.ts — Prisma Client Singleton
 *
 * PURPOSE:
 *   Creates and exports a SINGLE instance of PrismaClient for the entire app.
 *   Also provides connect/disconnect functions for startup/shutdown lifecycle.
 *
 * WHY A SINGLETON?
 * ─────────────────────────────────────────────────────────────────────────────
 * PrismaClient manages a CONNECTION POOL internally (like SqlConnection pooling
 * in ADO.NET). Creating multiple PrismaClient instances = multiple pools =
 * wasted database connections = potential "too many connections" errors.
 *
 * Rule: ONE PrismaClient instance per application.
 *
 * THE HOT-RELOAD PROBLEM:
 * ─────────────────────────────────────────────────────────────���───────────────
 * In development, tools like `tsx watch` (or Next.js dev server) reload your
 * code on every file change. Each reload would create a NEW PrismaClient,
 * but the OLD one doesn't get garbage collected immediately — it still holds
 * database connections open!
 *
 * After 20-30 saves, you'd have 20-30 PrismaClients all holding connections,
 * and PostgreSQL would refuse new connections ("sorry, too many clients").
 *
 * THE FIX: Store the client on `globalThis` (a global variable that survives
 * hot-reloads). On each reload, we check: "Is there already a client?"
 *   - Yes → reuse it (no new connections)
 *   - No  → create one and save it globally
 *
 * This is the standard Prisma pattern, documented in their official docs.
 *
 * .NET EQUIVALENT:
 *   In ASP.NET Core, the DI container manages DbContext lifetime for you
 *   (services.AddDbContext<AppDbContext>()). The framework ensures one context
 *   per request (Scoped lifetime). In Node.js, we manage this manually.
 *
 * PRISMA v7 DRIVER ADAPTER:
 *   Prisma v7 removed the built-in database drivers. Instead, you provide a
 *   "driver adapter" that wraps the actual database driver (like `pg` for PostgreSQL).
 *   This gives you full control over the connection pool (pool size, timeouts, SSL, etc.)
 *   instead of relying on Prisma's internal pool management.
 *
 *   Think of it like:
 *     EF Core + Npgsql provider  →  Prisma + @prisma/adapter-pg + pg
 *
 * LOGGING LEVELS:
 *   Development: log ALL queries (useful for debugging N+1 problems)
 *   Production: only warnings and errors (performance + noise reduction)
 */

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env';

// Allow self-signed SSL certificates for cloud-hosted PostgreSQL (Aiven, etc.)
// This must be set before any connections are created.
// In production, you'd provide the CA certificate from your cloud provider instead.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ──────────────────���────────────────────────────────���─────────────────────────
// Global Type Declaration
// ─────────────────────────────────────────────────────────────────────��───────
//
// TypeScript needs to know that `globalThis` might have a `prisma` property.
// We extend the global namespace to add this type.
//
// `var` (not `let` or `const`) is required here because `var` declarations
// in a `declare global` block attach to the global object.
// This is one of the VERY few places where `var` is still appropriate in modern TS.
//
// .NET equivalent: There isn't one — .NET's DI container handles instance lifetime.
// This is a Node.js-specific pattern for surviving hot-module-reload.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create or Reuse the PrismaClient Instance
// ────────────────────��────────────��───────────────────────────────────────────

/**
 * Creates a new PrismaClient with the pg driver adapter.
 *
 * In Prisma v7, you must provide a driver adapter — this is how Prisma
 * communicates with the actual database. The adapter wraps the `pg` library
 * (the most popular PostgreSQL client for Node.js).
 *
 * PrismaPg creates its own connection pool internally using the connection
 * string from your DATABASE_URL environment variable.
 */
function createPrismaClient(): PrismaClient {
  // PrismaPg is the adapter that bridges Prisma ↔ pg (node-postgres).
  // It accepts a connection string and manages the underlying Pool.
  //
  // .NET equivalent: This is like calling:
  //   services.AddDbContext<AppDbContext>(options =>
  //     options.UseNpgsql(connectionString));
  // Create a pg Pool with SSL configured for cloud-hosted databases (Aiven, etc.)
  // Cloud PostgreSQL providers use SSL certificates that Node.js doesn't trust by
  // default. Setting rejectUnauthorized: false tells Node to accept the connection
  // anyway. This is safe for cloud providers like Aiven where you trust the host.
  //
  // .NET equivalent: adding "Trust Server Certificate=true" to your connection string
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    // Log configuration:
    // Development → log everything (queries help you spot N+1 issues)
    // Production  → only warnings and errors (less noise, better performance)
    log: env.isDevelopment
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  });
}

/**
 * The singleton PrismaClient instance.
 *
 * In development: reuses the global instance across hot-reloads.
 * In production: creates a fresh instance (no hot-reload, so no problem).
 */
const prisma: PrismaClient = globalThis.prisma ?? createPrismaClient();

// In development, save the instance globally so hot-reloads reuse it.
// In production, this line is harmless (the process only starts once).
if (env.isDevelopment) {
  globalThis.prisma = prisma;
}

// ────────────────���───────────────��──────────────────────────────���─────────────
// Lifecycle Functions
// ──────────────────────��────────────────────────────��─────────────────────────

/**
 * Connects to the database.
 *
 * Call this at application startup (in server.ts).
 * Prisma auto-connects on the first query, but explicitly connecting gives us:
 *   1. Fail-fast behavior — if DB is unreachable, the app crashes immediately
 *      with a clear error, not on the first user request
 *   2. Startup logging — we can confirm the connection is established
 *
 * .NET equivalent: DbContext.Database.EnsureCreated() or Migrate() at startup
 *
 * @throws Error if the database is unreachable
 */
export async function connectDatabase(): Promise<void> {
  try {
    // $connect() opens the connection pool and validates connectivity
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[Database] Connected to PostgreSQL');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Database] Failed to connect:', error);
    // Re-throw so server.ts can catch and exit
    throw error;
  }
}

/**
 * Disconnects from the database.
 *
 * Call this during graceful shutdown (in server.ts).
 * Closes all connections in the pool cleanly — prevents "connection reset"
 * errors in PostgreSQL logs and ensures in-flight transactions complete.
 *
 * .NET equivalent: DbContext.Dispose() — but here it's the entire pool, not one context.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('[Database] Disconnected from PostgreSQL');
}

// ──────────��──────────────────────────────────��───────────────────────────────
// Export
// ────────────────────────��─────────────────────────���───────────────────��──────

// Default export: the PrismaClient instance (for use in repositories/services)
// Named exports: lifecycle functions (for use in server.ts)
export default prisma;

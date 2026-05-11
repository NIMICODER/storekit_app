// ── src/config/redis.ts ── Redis Client Singleton ────────────────────
//
// Mirrors the database.ts pattern: global declaration → factory → singleton → lifecycle.
//
// In C#, you'd register a singleton IDistributedCache (e.g. StackExchange.Redis)
// via builder.Services.AddStackExchangeRedisCache(). Here we do the same thing
// manually — one shared client instance, connected at startup, disconnected at shutdown.

import { createClient, type RedisClientType } from 'redis';
import { env } from './env';

// ── Global Type Declaration ─────────────────────────────────────────
// Survives hot-reloads in development (just like our Prisma singleton).
// Without this, each hot-reload would create a new Redis connection,
// eventually exhausting the connection pool.

declare global {
  // eslint-disable-next-line no-var
  var redisClient: RedisClientType | undefined;
}

// ── Client Factory ──────────────────────────────────────────────────

/**
 * Creates a Redis client configured from environment variables.
 *
 * The `redis` package (v4+) uses a URL-based connection string, similar to
 * how Prisma uses DATABASE_URL. The client is lazy — it won't connect
 * until you call `.connect()`.
 */
function createRedisClient(): RedisClientType {
  // Normalise the URL — if someone sets REDIS_URL=127.0.0.1:6379 without
  // the protocol, the `redis` package throws "Invalid URL". This guard
  // auto-prepends redis:// so it works either way.
  const redisUrl = env.redisUrl.startsWith('redis://')
    ? env.redisUrl
    : `redis://${env.redisUrl}`;

  const client = createClient({
    url: redisUrl,

    // Retry connecting with exponential backoff (max 3 seconds between retries).
    // In C#, StackExchange.Redis handles this internally with its reconnect logic.
    socket: {
      reconnectStrategy: (retries: number) => {
        // Cap at 3 seconds between retries
        const delay = Math.min(retries * 100, 3000);
        // eslint-disable-next-line no-console
        console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})...`);
        return delay;
      },
    },
  });

  // ── Event Listeners ─────────────────────────────────────────────────
  // These fire throughout the client's lifetime, not just at startup.

  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[Redis] Client error:', err.message);
  });

  client.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis] Client ready');
  });

  client.on('reconnecting', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis] Reconnecting...');
  });

  return client as RedisClientType;
}

// ── Singleton Instance ──────────────────────────────────────────────
// Reuses global instance in dev to avoid connection leaks across hot-reloads.

// Wrap creation in try-catch so a bad REDIS_URL (e.g. missing protocol)
// doesn't crash the entire app. If creation fails, redisClient is null
// and all caching is silently skipped — the app runs without Redis.
let redisClient: RedisClientType | null = null;
try {
  redisClient = globalThis.redisClient ?? createRedisClient();

  if (env.isDevelopment) {
    globalThis.redisClient = redisClient;
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Redis] Failed to create client — caching disabled:',
    error instanceof Error ? error.message : error,
  );
}

// ── Lifecycle ───────────────────────────────────────────────────────

/**
 * Opens the Redis connection. Call at startup alongside connectDatabase().
 *
 * Unlike the database, Redis failing to connect is NOT fatal — the app
 * can still work without caching (just slower). So we catch errors here
 * and log a warning instead of crashing.
 */
export async function connectRedis(): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.connect();
    // eslint-disable-next-line no-console
    console.log('[Redis] Connected to', env.redisUrl);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Redis] Failed to connect — caching disabled:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Closes the Redis connection cleanly. Call during graceful shutdown.
 *
 * `.quit()` sends a QUIT command to Redis and waits for pending replies,
 * similar to how `prisma.$disconnect()` drains the connection pool.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    // Only disconnect if the client is actually connected
    if (redisClient?.isOpen) {
      await redisClient.quit();
      // eslint-disable-next-line no-console
      console.log('[Redis] Disconnected');
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Redis] Error during disconnect:',
      error instanceof Error ? error.message : error,
    );
  }
}

// ── Export ───────────────────────────────────────────────────────────

export default redisClient;

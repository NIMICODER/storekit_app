// ── src/config/bullmq.ts ── IORedis Connection for BullMQ ───────────
//
// BullMQ requires IORedis, NOT the `redis` v5 package we use for caching.
// Both connect to the same Redis server — they're just different Node.js drivers.
//
// WHY TWO REDIS DRIVERS?
//   - `redis` v5 (node-redis):  Used by our CacheService (Phase 9). Lightweight, promise-native.
//   - `ioredis`:                 Used by BullMQ internally. More features (Cluster, Sentinel, Lua).
//   BullMQ was built on IORedis from day one and won't work with node-redis.
//
// In C#, this is like having both StackExchange.Redis (for caching) and
// ServiceStack.Redis (for a job library) — same server, different client SDKs.
//
// IMPORTANT: BullMQ requires `maxRetriesPerRequest: null` on the IORedis connection.
// Without this, IORedis throws "ReplyError: max retries per request reached"
// because BullMQ uses blocking commands (BRPOPLPUSH) that can wait indefinitely.

import IORedis from 'ioredis';
import { env } from './env';

// ── Global Declaration ──────────────────────────────────────────────
// Same hot-reload protection pattern as redis.ts and database.ts.

declare global {
  // eslint-disable-next-line no-var
  var bullMQConnection: IORedis | undefined;
}

// ── Connection Factory ──────────────────────────────────────────────

/**
 * Creates an IORedis instance configured for BullMQ.
 *
 * Key differences from our cache Redis client:
 *   1. Uses IORedis (not node-redis)
 *   2. Sets maxRetriesPerRequest: null (BullMQ requirement)
 *   3. Enables automatic reconnect with exponential backoff
 */
function createBullMQConnection(): IORedis {
  // IORedis accepts a URL string directly — no need to parse host/port manually.
  // It handles "redis://localhost:6379" and "rediss://..." (TLS) out of the box.
  const connection = new IORedis(env.bullRedisUrl, {
    // CRITICAL: BullMQ uses BRPOPLPUSH (blocking pop) which can wait forever.
    // Default IORedis retries requests 20 times, then throws. Setting this to
    // null tells IORedis "never give up on blocking commands" — exactly what
    // BullMQ needs. Without this, you'll see random "max retries" errors.
    maxRetriesPerRequest: null,

    // Enable offline queueing — commands sent while disconnected are queued
    // and replayed when the connection is restored. Good for transient failures.
    enableOfflineQueue: true,

    // Reconnect with exponential backoff, capped at 3 seconds.
    // Similar to our cache client's reconnectStrategy.
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  // ── Event Listeners ─────────────────────────────────────────────────

  connection.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[BullMQ] IORedis connected to', env.bullRedisUrl);
  });

  connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[BullMQ] IORedis error:', err.message);
  });

  connection.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('[BullMQ] IORedis connection closed');
  });

  return connection;
}

// ── Singleton Instance ──────────────────────────────────────────────

let bullMQConnection: IORedis | null = null;

try {
  bullMQConnection = globalThis.bullMQConnection ?? createBullMQConnection();

  if (env.isDevelopment) {
    globalThis.bullMQConnection = bullMQConnection;
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn(
    '[BullMQ] Failed to create IORedis connection — queues disabled:',
    error instanceof Error ? error.message : error,
  );
}

// ── Lifecycle ───────────────────────────────────────────────────────

/**
 * Close the IORedis connection. Call during graceful shutdown AFTER
 * draining all workers and closing all queues.
 *
 * In C#, this is like disposing your IConnectionMultiplexer at app shutdown.
 */
export async function closeBullMQConnection(): Promise<void> {
  try {
    if (bullMQConnection && bullMQConnection.status !== 'end') {
      await bullMQConnection.quit();
      // eslint-disable-next-line no-console
      console.log('[BullMQ] IORedis disconnected');
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[BullMQ] Error during disconnect:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Check if the BullMQ IORedis connection is alive.
 * Used by the health endpoint.
 */
export function isBullMQConnected(): boolean {
  return bullMQConnection?.status === 'ready';
}

// ── Export ───────────────────────────────────────────────────────────

export default bullMQConnection;

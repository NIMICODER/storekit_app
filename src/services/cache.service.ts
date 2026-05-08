// ── src/services/cache.service.ts ── Cache Abstraction Layer ─────────
//
// Wraps the raw Redis client with a clean, typed API for caching.
//
// KEY DESIGN: Graceful degradation.
// If Redis is down, every method silently returns null / does nothing.
// The app keeps working — just without caching (slower, but functional).
//
// In C#, this is similar to IDistributedCache with Get/Set/Remove methods.
// The difference: C# throws if Redis is down; we swallow errors by design.

import redisClient from '../config/redis';
import { env } from '../config/env';

// ── Cache Service ───────────────────────────────────────────────────

class CacheService {
  // Default TTL from env (seconds). Individual calls can override this.
  private defaultTtl: number = env.cacheTtl;

  // ── GET ─────────────────────────────────────────────────────────────
  /**
   * Retrieve a cached value by key. Returns null on miss OR Redis error.
   *
   * @template T - The expected shape of the cached data
   * @param key - Cache key (e.g. "products:/api/v1/products?page=1")
   * @returns Parsed object or null
   *
   * In C#: IDistributedCache.GetString(key) + JsonSerializer.Deserialize<T>()
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisClient.isOpen) return null;

      const cached = await redisClient.get(key);

      // Cache miss — key doesn't exist
      if (cached === null) return null;

      // Parse the JSON string back into an object.
      // We stored it as JSON in set(), so we parse it back here.
      return JSON.parse(cached) as T;
    } catch (error) {
      // Redis is down or data is corrupted — fail silently.
      // The controller will just hit the database instead.
      // eslint-disable-next-line no-console
      console.warn('[Cache] GET error for key:', key, error instanceof Error ? error.message : error);
      return null;
    }
  }

  // ── SET ─────────────────────────────────────────────────────────────
  /**
   * Store a value in the cache with an optional TTL.
   *
   * @param key   - Cache key
   * @param value - Any serializable value (will be JSON.stringify'd)
   * @param ttl   - Time-to-live in seconds (defaults to env.CACHE_TTL)
   *
   * In C#: IDistributedCache.SetString(key, json, new DistributedCacheEntryOptions {
   *   AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(ttl)
   * })
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      if (!redisClient.isOpen) return;

      const serialized = JSON.stringify(value);

      // SET with EX (expire) flag — Redis will auto-delete after TTL seconds.
      // This is the "cache-aside" pattern: you explicitly set what you want cached.
      await redisClient.set(key, serialized, {
        EX: ttl ?? this.defaultTtl,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Cache] SET error for key:', key, error instanceof Error ? error.message : error);
    }
  }

  // ── DELETE (single key) ─────────────────────────────────────────────
  /**
   * Remove a specific key from the cache.
   *
   * @param key - The exact cache key to delete
   *
   * In C#: IDistributedCache.Remove(key)
   */
  async del(key: string): Promise<void> {
    try {
      if (!redisClient.isOpen) return;

      await redisClient.del(key);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Cache] DEL error for key:', key, error instanceof Error ? error.message : error);
    }
  }

  // ── DELETE BY PATTERN ───────────────────────────────────────────────
  /**
   * Remove all keys matching a glob pattern (e.g. "products:*").
   *
   * Uses SCAN (not KEYS) to avoid blocking Redis on large datasets.
   * SCAN is cursor-based — it iterates in batches, safe for production.
   *
   * In C#, there's no built-in pattern delete in IDistributedCache.
   * You'd use StackExchange.Redis's IServer.Keys() + KeyDelete().
   *
   * @param pattern - Redis glob pattern (e.g. "products:*", "categories:*")
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      if (!redisClient.isOpen) return;

      // scanIterator is redis v5's async iterator for SCAN.
      // It handles cursor management internally — much cleaner than manual SCAN loops.
      // Under the hood, it sends SCAN 0 MATCH pattern COUNT 100, then SCAN <cursor>, etc.
      // Think of it like IAsyncEnumerable<T> in C# — lazy, streaming iteration.
      //
      // NOTE: In redis v5, scanIterator yields string | string[] depending on
      // the batch — so we normalize each chunk into a flat array.
      const keys: string[] = [];

      for await (const keyOrKeys of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        // Each iteration may yield a single key (string) or a batch (string[]).
        if (Array.isArray(keyOrKeys)) {
          keys.push(...keyOrKeys);
        } else {
          keys.push(keyOrKeys);
        }
      }

      // Delete all matching keys. We delete each key individually because
      // the redis v5 TypeScript types only accept a single string for .del().
      // In C#, you'd call db.KeyDelete(keys.Select(k => (RedisKey)k).ToArray()).
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => redisClient.del(key)));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Cache] DEL_PATTERN error for:', pattern, error instanceof Error ? error.message : error);
    }
  }

  // ── FLUSH ───────────────────────────────────────────────────────────
  /**
   * Clear ALL keys from the current Redis database.
   * ⚠️  Only use in development/testing — never in production!
   *
   * In C#: equivalent to calling IServer.FlushDatabase()
   */
  async flush(): Promise<void> {
    try {
      if (!redisClient.isOpen) return;

      await redisClient.flushDb();
      // eslint-disable-next-line no-console
      console.log('[Cache] Flushed all keys');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Cache] FLUSH error:', error instanceof Error ? error.message : error);
    }
  }
}

// ── Export Singleton ────────────────────────────────────────────────

export const cacheService = new CacheService();

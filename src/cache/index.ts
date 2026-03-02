import type { Logger } from 'pino';
import { createLogger } from '../logger/index.js';

/** Options for creating a Cache instance. */
export interface CacheOptions {
  /** Whether caching is enabled. Defaults to true. */
  enabled?: boolean;
  /** Redis connection URL. Omit for redis://localhost:6379. */
  url?: string;
}

/**
 * Redis cache wrapper with graceful disabled mode.
 * When Redis is unavailable or disabled, all operations silently no-op.
 * Uses a Redis client pool with exponential backoff reconnection.
 */
export class Cache {
  /** The raw Redis client pool, or null if caching is disabled. */
  // biome-ignore lint/suspicious/noExplicitAny: redis client types vary by version
  public redis: any | null = null;

  private _logger: Logger;

  constructor(options?: CacheOptions & { logger?: Logger }) {
    this._logger =
      options?.logger ?? createLogger({ level: 'warn', pretty: false });

    const enabled = options?.enabled ?? true;
    if (!enabled) {
      this._logger.debug('Cache disabled');
      return;
    }

    this._initRedis(options?.url);
  }

  private _initRedis(url?: string): void {
    // biome-ignore lint/suspicious/noExplicitAny: peer dep types
    let redis: any;
    try {
      redis = require('redis');
    } catch {
      this._logger.warn('redis package not installed, caching disabled');
      return;
    }

    this.redis = redis.createClientPool({ url }, { minimum: 1, maximum: 5 });

    this.redis.on('error', (err: Error) => {
      this._logger.error({ err }, 'Redis client error');
    });

    this.redis.on('reconnecting', () => {
      this._logger.info('Redis reconnecting');
    });

    this.redis.connect().catch((err: Error) => {
      this._logger.error({ err }, 'Redis initial connection failed');
      this.redis = null;
    });
  }

  /** Get a string value from cache. */
  async get(key: string): Promise<string | null> {
    return (await this.redis?.get(key)) ?? null;
  }

  /** Set a string value in cache with optional TTL in seconds. */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis?.set(key, value, { EX: ttl });
    } else {
      await this.redis?.set(key, value);
    }
  }

  /** Get a JSON-parsed record from cache. */
  async getRecord<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Set a JSON-serialized record in cache with optional TTL in seconds. */
  async setRecord(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  /** Delete a key from cache. */
  async delete(key: string): Promise<void> {
    await this.redis?.del(key);
  }

  /** Gracefully close the Redis connection. */
  async close(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.close();
      await this.redis.destroy();
    } catch (err: unknown) {
      // Swallow ClientClosedError — pool may already be closed
      if (
        err instanceof Error &&
        err.constructor.name === 'ClientClosedError'
      ) {
        return;
      }
      throw err;
    }
  }
}

/**
 * Creates a Cache instance from config or direct options.
 * Accepts either a config object with REDIS_ENABLED/REDIS_URL keys
 * or direct CacheOptions.
 */
export function createCache(
  options?: CacheOptions | Record<string, unknown>,
  logger?: Logger,
): Cache {
  if (!options) {
    return new Cache({ logger });
  }

  // Direct CacheOptions check
  if ('enabled' in options || 'url' in options) {
    return new Cache({
      ...(options as CacheOptions),
      logger,
    });
  }

  // Config-style object
  const cfg = options as Record<string, unknown>;
  return new Cache({
    enabled: (cfg.REDIS_ENABLED as boolean | undefined) ?? true,
    url: cfg.REDIS_URL as string | undefined,
    logger,
  });
}

export type { LiveConfigOptions } from './live-config.js';
export { LiveConfigService } from './live-config.js';

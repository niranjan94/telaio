import type { Logger } from 'pino';
import type { Cache } from './index.js';

/** Options for creating a LiveConfigService. */
export interface LiveConfigOptions {
  /** Cache instance for SWR caching. */
  cache: Cache;
  /** Kysely database instance for fetching configs from the live_configs table. */
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  db: any;
  /** Cache TTL in seconds. Defaults to 120. */
  ttl?: number;
  /** Cache key prefix. Defaults to 'live-config'. */
  keyPrefix?: string;
  /** Logger instance. */
  logger?: Logger;
}

/**
 * Stale-while-revalidate config service backed by a database table and Redis.
 * On cache hit, returns the cached value immediately and refreshes in the background.
 * On cache miss, fetches from DB, caches, and returns.
 *
 * The config table shape expected: `live_configs(module TEXT, config JSONB)`
 */
export class LiveConfigService {
  private _cache: Cache;
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  private _db: any;
  private _ttl: number;
  private _keyPrefix: string;
  private _logger: Logger | undefined;

  constructor(options: LiveConfigOptions) {
    this._cache = options.cache;
    this._db = options.db;
    this._ttl = options.ttl ?? 120;
    this._keyPrefix = options.keyPrefix ?? 'live-config';
    this._logger = options.logger;
  }

  /** Builds the cache key for a given module. */
  private _cacheKey(module: string): string {
    return `${this._keyPrefix}::${module}`;
  }

  /** Fetches the latest config from the database and updates the cache. */
  private async _getLatestConfig<T>(module: string): Promise<T | null> {
    try {
      const row = await this._db
        .selectFrom('liveConfigs')
        .selectAll()
        .where('module', '=', module)
        .executeTakeFirst();

      if (!row) return null;

      const config = row.config;
      await this._cache.setRecord(this._cacheKey(module), config, this._ttl);
      return config;
    } catch (err) {
      this._logger?.error(
        { err, module },
        'Failed to fetch live config from DB',
      );
      return null;
    }
  }

  /**
   * Gets the config for a module using SWR strategy.
   * Returns cached value immediately if available, refreshes in background.
   * Falls back to DB on cache miss.
   */
  async get<T = Record<string, unknown>>(module: string): Promise<T | null> {
    const cached = await this._cache.getRecord<T>(this._cacheKey(module));

    if (cached !== null) {
      // SWR: return stale, revalidate in background
      this._getLatestConfig<T>(module).catch((e) => {
        this._logger?.error(
          { err: e, module },
          'Background config refresh failed',
        );
      });
      return cached;
    }

    // Cache miss — fetch from DB
    return this._getLatestConfig<T>(module);
  }

  /**
   * Updates a module's config in both the database and cache.
   * Uses upsert (insert on conflict update) for the database write.
   */
  async set<T = Record<string, unknown>>(
    module: string,
    config: T,
  ): Promise<void> {
    await this._db
      .insertInto('liveConfigs')
      .values({ module, config: JSON.stringify(config) })
      .onConflict(
        (oc: {
          column: (col: string) => {
            doUpdateSet: (obj: Record<string, unknown>) => unknown;
          };
        }) =>
          oc.column('module').doUpdateSet({ config: JSON.stringify(config) }),
      )
      .execute();

    await this._cache.setRecord(this._cacheKey(module), config, this._ttl);
  }
}

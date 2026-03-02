import { randomUUID } from 'node:crypto';
import fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { AuthAdapter } from './auth/adapter.js';
import { buildAuthPlugin } from './auth/plugin.js';
import { type Cache, type CacheOptions, createCache } from './cache/index.js';
import {
  createDatabase,
  createPool,
  type DatabaseOptions,
  type PoolOptions,
  registerCitextParser,
} from './db/client.js';
import { createLogger } from './logger/index.js';
import { registerBuiltinSchemas, registerSchemas } from './schema/index.js';
import { registerHooks } from './server/hooks.js';
import { type PluginOptions, registerPlugins } from './server/plugins.js';
import { registerScalar, type ScalarOptions } from './server/scalar.js';
import { registerSwagger, type SwaggerOptions } from './server/swagger.js';
import type {
  DefaultFeatures,
  Features,
  StartOptions,
  TelaioApp,
} from './types.js';

/** Options for withDatabase(). Supports three modes: pool+db, pool-only, or from-config. */
export interface WithDatabaseOptions {
  /** Pre-created pg.Pool (for sharing with auth libraries). */
  pool?: import('pg').Pool;
  /** Pre-created Kysely instance (for sharing with auth libraries). */
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  db?: import('kysely').Kysely<any>;
  /** Pool options when creating a pool internally. */
  poolOptions?: PoolOptions;
  /** Kysely options when creating a database internally. */
  databaseOptions?: DatabaseOptions;
  /** Whether to register the CITEXT array parser. Defaults to true. */
  citext?: boolean;
}

/** Options for withCache(). */
export interface WithCacheOptions {
  /** Pre-created Cache instance (for sharing with auth libraries). */
  instance?: Cache;
  /** Cache options when creating internally. */
  cacheOptions?: CacheOptions;
}

/** Options passed to createApp(). */
export interface CreateAppOptions<
  TConfig extends Record<string, unknown> = Record<string, never>,
> {
  config?: TConfig;
  logger?: Logger;
}

/**
 * Fluent builder for constructing a TelaioApp.
 * Features are tracked as phantom type parameters for compile-time safety.
 */
export class AppBuilder<
  F extends Features = DefaultFeatures,
  TSession = unknown,
  TConfig extends Record<string, unknown> = Record<string, never>,
> {
  private _config: TConfig;
  private _logger: Logger;
  private _pluginOptions: PluginOptions = {};
  private _swaggerOptions: SwaggerOptions | null = null;
  private _scalarOptions: ScalarOptions | null = null;
  private _schemasDir: string | null = null;
  private _dbOptions: WithDatabaseOptions | null = null;
  private _cacheOptions: WithCacheOptions | null = null;
  // biome-ignore lint/suspicious/noExplicitAny: session type varies
  private _authAdapter: AuthAdapter<any> | null = null;
  private _onReady: (() => Promise<void>) | null = null;
  private _onClose: (() => Promise<void>) | null = null;
  private _ephemeral = false;

  constructor(options: CreateAppOptions<TConfig> = {}) {
    this._config = (options.config ?? {}) as TConfig;
    this._logger = options.logger ?? createLogger({ pretty: false });
  }

  /** Configure Fastify plugin registration options. */
  withPlugins(options: PluginOptions): AppBuilder<F, TSession, TConfig> {
    this._pluginOptions = { ...this._pluginOptions, ...options };
    return this;
  }

  /**
   * Enable database support with pool and Kysely.
   * Accepts pre-created instances (for sharing with auth libraries) or creates them internally.
   */
  withDatabase(
    options?: WithDatabaseOptions,
  ): AppBuilder<F & { database: true }, TSession, TConfig> {
    this._dbOptions = options ?? {};
    return this as unknown as AppBuilder<
      F & { database: true },
      TSession,
      TConfig
    >;
  }

  /**
   * Enable cache support with Redis.
   * Accepts a pre-created Cache instance (for sharing with auth libraries) or creates one internally.
   */
  withCache(
    options?: WithCacheOptions,
  ): AppBuilder<F & { cache: true }, TSession, TConfig> {
    this._cacheOptions = options ?? {};
    return this as unknown as AppBuilder<
      F & { cache: true },
      TSession,
      TConfig
    >;
  }

  /**
   * Enable authentication with a custom auth adapter.
   * The adapter's session type flows through to request decorators.
   */
  withAuth<S>(
    adapter: AuthAdapter<S>,
  ): AppBuilder<F & { auth: true }, S, TConfig> {
    // biome-ignore lint/suspicious/noExplicitAny: session type erased at runtime
    this._authAdapter = adapter as AuthAdapter<any>;
    return this as unknown as AppBuilder<F & { auth: true }, S, TConfig>;
  }

  /** Configure OpenAPI/Swagger spec generation. */
  withSwagger(options: SwaggerOptions): AppBuilder<F, TSession, TConfig> {
    this._swaggerOptions = options;
    return this;
  }

  /** Enable Scalar API documentation UI. */
  withApiDocs(
    options?: ScalarOptions,
  ): AppBuilder<F & { apiDocs: true }, TSession, TConfig> {
    this._scalarOptions = options ?? {};
    return this as unknown as AppBuilder<
      F & { apiDocs: true },
      TSession,
      TConfig
    >;
  }

  /** Set the directory for auto-registering TypeBox schemas. */
  withSchemas(schemasDir: string): AppBuilder<F, TSession, TConfig> {
    this._schemasDir = schemasDir;
    return this;
  }

  /** Register a callback to run when the server is ready. */
  onReady(fn: () => Promise<void>): AppBuilder<F, TSession, TConfig> {
    this._onReady = fn;
    return this;
  }

  /** Register a callback to run when the server is closing. */
  onClose(fn: () => Promise<void>): AppBuilder<F, TSession, TConfig> {
    this._onClose = fn;
    return this;
  }

  /**
   * Mark this build as ephemeral (for client generation).
   * Skips hooks but registers plugins + schemas.
   */
  asEphemeral(): AppBuilder<F, TSession, TConfig> {
    this._ephemeral = true;
    return this;
  }

  /** Build and return the configured TelaioApp. */
  async build(): Promise<TelaioApp<F, TSession, TConfig>> {
    const logger = this._logger;
    const config = this._config;

    // Resolve baseDir from config or cwd
    const baseDir =
      ((config as Record<string, unknown>).BASE_DIR as string | undefined) ??
      process.cwd();

    // Resolve trustProxy from config
    const trustProxy =
      ((config as Record<string, unknown>).WHITELIST_PROXIES as string[]) ??
      undefined;

    const app: FastifyInstance = fastify({
      genReqId() {
        return randomUUID();
      },
      loggerInstance: logger.child({}) as FastifyBaseLogger,
      trustProxy,
      disableRequestLogging: true,
      exposeHeadRoutes: false,
    });

    // 0. Set up database if configured
    let pool: import('pg').Pool | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: generic database type
    let db: import('kysely').Kysely<any> | undefined;

    if (this._dbOptions) {
      const dbOpts = this._dbOptions;

      // Resolve pool: use provided or create from config/options
      pool =
        dbOpts.pool ??
        createPool(
          dbOpts.poolOptions ?? (config as Record<string, unknown>),
          logger,
        );

      // Resolve db: use provided or create from pool
      db = dbOpts.db ?? createDatabase(pool, dbOpts.databaseOptions);

      // Register CITEXT parser unless explicitly disabled
      if (dbOpts.citext !== false) {
        await registerCitextParser(pool, logger);
      }
    }

    // 0b. Set up cache if configured
    let cache: Cache | undefined;

    if (this._cacheOptions) {
      const cacheOpts = this._cacheOptions;
      cache =
        cacheOpts.instance ??
        createCache(
          cacheOpts.cacheOptions ?? (config as Record<string, unknown>),
          logger,
        );
    }

    // 1. Register plugins (ordered)
    await registerPlugins(app, this._pluginOptions, { logger, baseDir });

    // 2. Register swagger (before schemas, before scalar)
    if (this._swaggerOptions) {
      await registerSwagger(app, this._swaggerOptions);
    } else {
      // Register with minimal defaults so .withApiDocs() works
      const appName =
        ((config as Record<string, unknown>).APP_NAME as string | undefined) ??
        'API';
      await registerSwagger(app, { info: { title: appName } });
    }

    // 2b. Register auth plugin (after swagger, before schemas)
    if (this._authAdapter) {
      const authPlugin = buildAuthPlugin({
        adapter: this._authAdapter,
        logger,
      });
      await app.register(authPlugin);
    }

    // 3. Register built-in schemas
    await registerBuiltinSchemas(app);

    // 4. Register user schemas from directory
    if (this._schemasDir) {
      await registerSchemas(app, this._schemasDir);
    }

    // 5. Register Scalar API docs
    if (this._scalarOptions) {
      registerScalar(app, this._scalarOptions);
    }

    // 6. Register hooks (unless ephemeral)
    if (!this._ephemeral) {
      await registerHooks(app, {
        logger,
        onReady: this._onReady ?? undefined,
        onClose: this._onClose ?? undefined,
      });
    }

    // biome-ignore lint/suspicious/noExplicitAny: conditional properties based on features
    const telaioApp: any = {
      fastify: app,
      config,
      logger,

      async start(options?: StartOptions) {
        const port =
          options?.port ??
          ((config as Record<string, unknown>).API_LISTEN_PORT as
            | number
            | undefined) ??
          4001;
        const host =
          options?.host ??
          ((config as Record<string, unknown>).API_LISTEN_ADDRESS as
            | string
            | undefined) ??
          '0.0.0.0';

        await app.listen({ port, host });
        logger.info({ port, host }, 'server started');
      },

      async stop() {
        await app.close();
        if (cache) {
          await cache.close();
        }
        if (db) {
          await db.destroy();
        }
        if (pool) {
          await pool.end();
        }
        logger.info('server stopped');
      },
    };

    // Attach database resources if configured
    if (pool) telaioApp.pool = pool;
    if (db) telaioApp.db = db;

    // Attach cache if configured
    if (cache) telaioApp.cache = cache;

    return telaioApp;
  }
}

/**
 * Creates a new AppBuilder for fluent app construction.
 * Pass a validated config object to make it available throughout the app.
 */
export function createApp<
  TConfig extends Record<string, unknown> = Record<string, never>,
>(
  options?: CreateAppOptions<TConfig>,
): AppBuilder<DefaultFeatures, unknown, TConfig> {
  return new AppBuilder(options);
}

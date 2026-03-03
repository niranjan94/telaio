import dotenv from 'dotenv';
import type { ZodRawShape } from 'zod';
import { z } from 'zod';

import { loadEnv } from './loader.js';
import {
  type CacheConfig,
  type CoreConfig,
  cacheConfigSchema,
  coreConfigSchema,
  type DatabaseConfig,
  databaseConfigSchema,
  type EmailConfig,
  emailConfigSchema,
  type QueueConfig,
  queueConfigSchema,
  type S3Config,
  type ServerConfig,
  s3ConfigSchema,
  serverConfigSchema,
} from './schemas.js';

export { loadEnv } from './loader.js';
export { csvString, envBoolean } from './schemas.js';

/** Brand symbol used to identify `defineConfig()` results. */
const TELAIO_CONFIG_BRAND = Symbol.for('telaio-config');

/** Client generation config for hey-api OpenAPI client. */
export interface ClientConfig {
  /** Output directory for generated client. Default: 'client'. */
  output?: string;
  /** hey-api plugins to use. Default: standard set (react-query, typescript, schemas). */
  plugins?: (string | Record<string, unknown>)[];
  /** Whether client generation is enabled in dev mode. Default: true. */
  enabled?: boolean;
}

/** Queue consumer config. */
export interface ConsumerConfig {
  /** Path to queue registry module. Default: 'src/queues/registry/index.ts'. */
  registry?: string;
}

/** Dev command config -- additive to auto-discovered processes. */
export interface DevConfig {
  /** Additional processes to run alongside auto-discovered ones. */
  processes?: { name: string; command: string; prefixColor?: string }[];
  /** File watcher configuration. */
  watch?: {
    /** Additional paths to watch (merged with defaults: src, .env). */
    include?: string[];
    /** Additional paths to ignore (merged with defaults: node_modules, .git, dist). */
    ignore?: string[];
    /** Debounce interval in ms. Default: 300. */
    debounceMs?: number;
  };
  /** Log file path for tee output. Default: 'output.log'. */
  output?: string;
}

/** CLI metadata extracted from a defineConfig result (no env loading needed). */
export interface CliMetadata {
  app?: string;
  client?: ClientConfig;
  consumer?: ConsumerConfig;
  dev?: DevConfig;
}

/** Options accepted by `defineConfig()` -- excludes runtime-only fields, adds CLI metadata. */
export type DefineConfigOptions<
  TModules extends ConfigModules = ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
> = Omit<LoadConfigOptions<TModules, TExtend>, 'skipEnvLoad' | 'source'> & {
  /** Path to app builder module. Default: auto-discover. */
  app?: string;
  /** Client generation config. */
  client?: ClientConfig;
  /** Queue consumer config. */
  consumer?: ConsumerConfig;
  /** Dev command config. */
  dev?: DevConfig;
};

/** Branded result returned by `defineConfig()`. */
export type DefineConfigResult<
  TModules extends ConfigModules = ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
> = DefineConfigOptions<TModules, TExtend> & {
  readonly [K: symbol]: true;
};

/**
 * Declares config options for the telaio CLI to resolve at runtime.
 * Works like `vitest.config.ts` -- the CLI discovers `telaio.config.ts`,
 * imports it, and calls `loadConfigAsync()` with the provided options.
 */
export function defineConfig<
  const TModules extends ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
>(
  options: DefineConfigOptions<TModules, TExtend>,
): DefineConfigResult<TModules, TExtend> {
  return Object.assign({}, options, {
    [TELAIO_CONFIG_BRAND]: true as const,
  }) as DefineConfigResult<TModules, TExtend>;
}

/** Type guard that checks whether a value was produced by `defineConfig()`. */
export function isDefineConfigResult(
  value: unknown,
): value is DefineConfigResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[TELAIO_CONFIG_BRAND] === true
  );
}

/**
 * Extracts CLI metadata from a branded defineConfig result without loading env vars.
 * Used by the CLI to read app/client/consumer/dev settings without triggering Zod parsing.
 */
export function extractCliMetadata(result: DefineConfigResult): CliMetadata {
  return {
    app: result.app,
    client: result.client,
    consumer: result.consumer,
    dev: result.dev,
  };
}

export type {
  CacheConfig,
  CoreConfig,
  DatabaseConfig,
  EmailConfig,
  QueueConfig,
  S3Config,
  ServerConfig,
};

/** Modules that control which config schema fragments are merged. */
export interface ConfigModules {
  server?: boolean;
  database?: boolean;
  cache?: boolean;
  queue?: boolean;
  s3?: boolean;
  email?: boolean;
}

/** Options for loadConfig(). */
export interface LoadConfigOptions<
  TModules extends ConfigModules = ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
> {
  /** Enable module-specific config fragments. */
  modules?: TModules;
  /** App-specific Zod schema to merge with the composed schema. */
  extend?: TExtend;
  /**
   * Skip loading env from dotenv/.env files.
   * Useful when env is already loaded or in tests.
   */
  skipEnvLoad?: boolean;
  /** Override the source object to parse (defaults to process.env). */
  source?: Record<string, unknown>;
}

/**
 * Infers the config return type based on enabled module flags and user extension.
 * Each enabled flag merges the corresponding module config into the result.
 */
export type InferConfig<
  TModules extends ConfigModules,
  TExtend extends z.ZodType,
> = CoreConfig &
  (TModules['server'] extends true ? ServerConfig : unknown) &
  (TModules['database'] extends true ? DatabaseConfig : unknown) &
  (TModules['cache'] extends true ? CacheConfig : unknown) &
  (TModules['queue'] extends true ? QueueConfig : unknown) &
  (TModules['s3'] extends true ? S3Config : unknown) &
  (TModules['email'] extends true ? EmailConfig : unknown) &
  z.infer<TExtend>;

/** Collects Zod object shapes from enabled modules into a single merged shape. */
function collectShapes(modules: ConfigModules): ZodRawShape {
  const shapes: ZodRawShape[] = [coreConfigSchema.shape];

  if (modules.server) shapes.push(serverConfigSchema.shape);
  if (modules.database) shapes.push(databaseConfigSchema.shape);
  if (modules.cache) shapes.push(cacheConfigSchema.shape);
  if (modules.queue) shapes.push(queueConfigSchema.shape);
  if (modules.s3) shapes.push(s3ConfigSchema.shape);
  if (modules.email) shapes.push(emailConfigSchema.shape);

  return Object.assign({}, ...shapes);
}

/**
 * Loads and validates config from environment variables.
 * Composes a Zod schema from core + enabled module schemas + user extension.
 * Optionally loads env vars from .env files before parsing.
 */
export function loadConfig<
  const TModules extends ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
>(
  options: LoadConfigOptions<TModules, TExtend> = {},
): InferConfig<TModules, TExtend> {
  const { modules = {} as TModules, extend, skipEnvLoad = false, source } = options;

  if (!skipEnvLoad) {
    dotenv.config({ quiet: true });
  }

  const shape = collectShapes(modules);

  // Merge user extension shape if provided
  const extendShape =
    extend && 'shape' in extend
      ? (extend as unknown as z.ZodObject<ZodRawShape>).shape
      : {};

  const finalSchema = z.object({ ...shape, ...extendShape });

  return finalSchema.parse(source ?? process.env) as InferConfig<
    TModules,
    TExtend
  >;
}

/**
 * Async version of loadConfig that supports SSM Parameter Store loading.
 * Use this when CONFIG_SOURCE=ssm:/path is set.
 */
export async function loadConfigAsync<
  const TModules extends ConfigModules,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
>(
  options: LoadConfigOptions<TModules, TExtend> = {},
): Promise<InferConfig<TModules, TExtend>> {
  if (!options.skipEnvLoad) {
    await loadEnv();
  }
  return loadConfig({ ...options, skipEnvLoad: true });
}

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

export type {
  CacheConfig,
  CoreConfig,
  DatabaseConfig,
  EmailConfig,
  QueueConfig,
  S3Config,
  ServerConfig,
};

/** Feature flags that control which config schema fragments are merged. */
export interface ConfigModuleFlags {
  server?: boolean;
  database?: boolean;
  cache?: boolean;
  queue?: boolean;
  s3?: boolean;
  email?: boolean;
}

/** Options for loadConfig(). */
export interface LoadConfigOptions<
  TFlags extends ConfigModuleFlags = ConfigModuleFlags,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
> {
  /** Enable module-specific config fragments. */
  flags?: TFlags;
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
  TFlags extends ConfigModuleFlags,
  TExtend extends z.ZodType,
> = CoreConfig &
  (TFlags['server'] extends true ? ServerConfig : unknown) &
  (TFlags['database'] extends true ? DatabaseConfig : unknown) &
  (TFlags['cache'] extends true ? CacheConfig : unknown) &
  (TFlags['queue'] extends true ? QueueConfig : unknown) &
  (TFlags['s3'] extends true ? S3Config : unknown) &
  (TFlags['email'] extends true ? EmailConfig : unknown) &
  z.infer<TExtend>;

/** Collects Zod object shapes from enabled module flags into a single merged shape. */
function collectShapes(flags: ConfigModuleFlags): ZodRawShape {
  const shapes: ZodRawShape[] = [coreConfigSchema.shape];

  if (flags.server) shapes.push(serverConfigSchema.shape);
  if (flags.database) shapes.push(databaseConfigSchema.shape);
  if (flags.cache) shapes.push(cacheConfigSchema.shape);
  if (flags.queue) shapes.push(queueConfigSchema.shape);
  if (flags.s3) shapes.push(s3ConfigSchema.shape);
  if (flags.email) shapes.push(emailConfigSchema.shape);

  return Object.assign({}, ...shapes);
}

/**
 * Loads and validates config from environment variables.
 * Composes a Zod schema from core + enabled module schemas + user extension.
 * Optionally loads env vars from .env files before parsing.
 */
export function loadConfig<
  const TFlags extends ConfigModuleFlags,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
>(
  options: LoadConfigOptions<TFlags, TExtend> = {},
): InferConfig<TFlags, TExtend> {
  const { flags = {} as TFlags, extend, skipEnvLoad = false, source } = options;

  if (!skipEnvLoad) {
    dotenv.config({ quiet: true });
  }

  const shape = collectShapes(flags);

  // Merge user extension shape if provided
  const extendShape =
    extend && 'shape' in extend
      ? (extend as unknown as z.ZodObject<ZodRawShape>).shape
      : {};

  const finalSchema = z.object({ ...shape, ...extendShape });

  return finalSchema.parse(source ?? process.env) as InferConfig<
    TFlags,
    TExtend
  >;
}

/**
 * Async version of loadConfig that supports SSM Parameter Store loading.
 * Use this when CONFIG_SOURCE=ssm:/path is set.
 */
export async function loadConfigAsync<
  const TFlags extends ConfigModuleFlags,
  TExtend extends z.ZodType = z.ZodObject<Record<string, never>>,
>(
  options: LoadConfigOptions<TFlags, TExtend> = {},
): Promise<InferConfig<TFlags, TExtend>> {
  if (!options.skipEnvLoad) {
    await loadEnv();
  }
  return loadConfig({ ...options, skipEnvLoad: true });
}

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

/** Tracks which features are enabled on a TelaioApp via the builder. */
export interface Features {
  database: boolean;
  cache: boolean;
  queue: boolean;
  auth: boolean;
  apiDocs: boolean;
}

/** Default feature state — all features disabled. */
export type DefaultFeatures = {
  database: false;
  cache: false;
  queue: false;
  auth: false;
  apiDocs: false;
};

/** Options for starting the app server. */
export interface StartOptions {
  port?: number;
  host?: string;
}

/**
 * The assembled API server. Exposes the Fastify instance, config, logger,
 * and conditionally database/cache/queue/auth based on enabled features.
 */
export type TelaioApi<
  F extends Features = DefaultFeatures,
  TSession = unknown,
  TConfig extends Record<string, unknown> = Record<string, never>,
> = {
  fastify: FastifyInstance;
  config: TConfig;
  logger: Logger;
  start: (options?: StartOptions) => Promise<void>;
  stop: () => Promise<void>;
} & (F['database'] extends true
  ? { pool: import('postgres').Sql; db: import('kysely').Kysely<unknown> }
  : unknown) &
  (F['cache'] extends true ? { cache: unknown } : unknown) &
  (F['queue'] extends true ? { queue: unknown } : unknown) &
  (F['auth'] extends true ? { auth: { session: TSession } } : unknown);

/**
 * The assembled queue consumer. No Fastify instance, no auth.
 * Exposes config, logger, and conditionally database/cache/queue
 * based on enabled features.
 */
export type TelaioConsumer<
  F extends Features = DefaultFeatures,
  TConfig extends Record<string, unknown> = Record<string, never>,
> = {
  config: TConfig;
  logger: Logger;
  start: () => Promise<void>;
  stop: () => Promise<void>;
} & (F['database'] extends true
  ? { pool: import('postgres').Sql; db: import('kysely').Kysely<unknown> }
  : unknown) &
  (F['cache'] extends true ? { cache: unknown } : unknown) &
  (F['queue'] extends true ? { queue: unknown } : unknown);

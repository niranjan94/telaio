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
 * The assembled telaio application. Properties are conditionally present
 * based on which features were enabled via the builder.
 */
export type TelaioApp<
  F extends Features = DefaultFeatures,
  TSession = unknown,
  TConfig extends Record<string, unknown> = Record<string, never>,
> = {
  /** The underlying Fastify instance. */
  fastify: FastifyInstance;
  /** Validated app configuration. */
  config: TConfig;
  /** Pino logger instance. */
  logger: Logger;
  /** Start the HTTP server. */
  start: (options?: StartOptions) => Promise<void>;
  /** Gracefully stop the server and all managed resources. */
  stop: () => Promise<void>;
} & (F['database'] extends true
  ? { pool: import('pg').Pool; db: import('kysely').Kysely<unknown> }
  : unknown) &
  (F['cache'] extends true ? { cache: unknown } : unknown) &
  (F['queue'] extends true ? { queue: unknown } : unknown) &
  (F['auth'] extends true ? { auth: { session: TSession } } : unknown);

import type { Logger } from 'pino';
import { createLogger } from '../logger/index.js';

/** Options for creating a PostgreSQL connection pool. */
export interface PoolOptions {
  connectionString: string;
  ssl?: boolean;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  max?: number;
}

/** Options for creating a Kysely database instance. */
export interface DatabaseOptions {
  /** Additional Kysely plugins to register alongside CamelCasePlugin. */
  // biome-ignore lint/suspicious/noExplicitAny: Kysely plugin types vary
  plugins?: any[];
}

/**
 * Determines whether SSL should be enabled based on the connection string.
 * Auto-enables for AWS RDS endpoints.
 */
function shouldEnableSsl(
  connectionString: string,
  explicitSsl?: boolean,
): { rejectUnauthorized: boolean } | undefined {
  if (explicitSsl === true) return { rejectUnauthorized: false };
  if (explicitSsl === false) return undefined;
  // Auto-detect RDS
  if (connectionString.includes('rds.amazonaws.com')) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/**
 * Creates a PostgreSQL connection pool.
 * Accepts either a config object with DATABASE_URL/DATABASE_SSL keys or direct PoolOptions.
 * Automatically enables SSL for AWS RDS endpoints.
 */
export function createPool(
  options: PoolOptions | Record<string, unknown>,
  poolLogger?: Logger,
): import('pg').Pool {
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types
  let pg: any;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic peer dep
    pg = (globalThis as any).__telaio_pg ?? require('pg');
  } catch {
    throw new Error(
      "telaio: createPool() requires 'pg' to be installed. Run: pnpm add pg",
    );
  }

  const log = poolLogger ?? createLogger({ level: 'warn', pretty: false });

  let connectionString: string;
  let ssl: { rejectUnauthorized: boolean } | undefined;
  let idleTimeoutMillis: number;
  let connectionTimeoutMillis: number;
  let max: number | undefined;

  if (
    'connectionString' in options &&
    typeof options.connectionString === 'string'
  ) {
    const poolOpts = options as PoolOptions;
    connectionString = poolOpts.connectionString;
    ssl = shouldEnableSsl(connectionString, poolOpts.ssl);
    idleTimeoutMillis = poolOpts.idleTimeoutMillis ?? 30_000;
    connectionTimeoutMillis = poolOpts.connectionTimeoutMillis ?? 2_000;
    max = poolOpts.max;
  } else {
    // Config-style object
    const cfg = options as Record<string, unknown>;
    connectionString =
      (cfg.DATABASE_URL as string | undefined) ?? 'postgresql://localhost/app';
    ssl = shouldEnableSsl(
      connectionString,
      cfg.DATABASE_SSL as boolean | undefined,
    );
    idleTimeoutMillis = 30_000;
    connectionTimeoutMillis = 2_000;
  }

  const pool = new pg.Pool({
    connectionString,
    ssl,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    ...(max !== undefined ? { max } : {}),
  });

  pool.on('error', (err: Error) => {
    log.error({ err }, 'Postgres pool error');
  });

  return pool;
}

/**
 * Registers a CITEXT array parser on the pg types system.
 * This ensures that arrays of case-insensitive text columns are properly parsed.
 */
export async function registerCitextParser(
  pool: import('pg').Pool,
  logger?: Logger,
): Promise<void> {
  const log = logger ?? createLogger({ level: 'warn', pretty: false });

  let parseArray: (input: string) => string[];
  try {
    const mod = await import('postgres-array');
    parseArray = mod.parse;
  } catch {
    log.debug('postgres-array not installed, skipping CITEXT parser');
    return;
  }

  // biome-ignore lint/suspicious/noExplicitAny: pg.types varies
  let pgTypes: any;
  try {
    pgTypes = require('pg').types;
  } catch {
    return;
  }

  try {
    const {
      rows: [citextType],
    } = await pool.query(
      "SELECT typarray FROM pg_type WHERE typname = 'citext'",
    );
    if (citextType?.typarray) {
      pgTypes.setTypeParser(citextType.typarray, parseArray);
    }
  } catch (e) {
    log.error({ e }, 'Failed to register CITEXT array parser');
  }
}

/**
 * Creates a Kysely database instance wrapping an existing pool.
 * Automatically applies CamelCasePlugin for snake_case to camelCase mapping.
 */
export function createDatabase<DB>(
  pool: import('pg').Pool,
  options?: DatabaseOptions,
): import('kysely').Kysely<DB> {
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types
  let kysely: any;
  try {
    kysely = require('kysely');
  } catch {
    throw new Error(
      "telaio: createDatabase() requires 'kysely' to be installed. Run: pnpm add kysely",
    );
  }

  const dialect = new kysely.PostgresDialect({ pool });

  const plugins = [new kysely.CamelCasePlugin(), ...(options?.plugins ?? [])];

  return new kysely.Kysely({ dialect, plugins });
}

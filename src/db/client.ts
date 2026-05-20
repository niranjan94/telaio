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
  /**
   * Whether to enable CamelCasePlugin for snake_case to camelCase mapping.
   * Defaults to `true` when omitted.
   */
  camelCase?: boolean;
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
): 'require' | undefined {
  if (explicitSsl === true) return 'require';
  if (explicitSsl === false) return undefined;
  // Auto-detect RDS
  if (connectionString.includes('rds.amazonaws.com')) {
    return 'require';
  }
  return undefined;
}

/**
 * Creates a PostgreSQL connection pool.
 * Accepts either a config object with DATABASE_URL/DATABASE_SSL keys or direct PoolOptions.
 * Automatically enables SSL for AWS RDS endpoints.
 */
export async function createPool(
  options: PoolOptions | Record<string, unknown>,
  poolLogger?: Logger,
): Promise<import('postgres').Sql> {
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types
  let postgres: any;
  try {
    postgres = (await import('postgres')).default;
  } catch {
    throw new Error(
      "telaio: createPool() requires 'postgres' to be installed. Run: pnpm add postgres",
    );
  }

  const log = poolLogger ?? createLogger({ level: 'warn', pretty: false });

  let connectionString: string;
  let ssl: 'require' | undefined;
  let idleTimeout: number;
  let connectTimeout: number;
  let max: number | undefined;

  if (
    'connectionString' in options &&
    typeof options.connectionString === 'string'
  ) {
    const poolOpts = options as PoolOptions;
    connectionString = poolOpts.connectionString;
    ssl = shouldEnableSsl(connectionString, poolOpts.ssl);
    idleTimeout = Math.round((poolOpts.idleTimeoutMillis ?? 30_000) / 1000);
    connectTimeout = Math.round(
      (poolOpts.connectionTimeoutMillis ?? 2_000) / 1000,
    );
    max = poolOpts.max;
  } else {
    const cfg = options as Record<string, unknown>;
    connectionString =
      (cfg.DATABASE_URL as string | undefined) ?? 'postgresql://localhost/app';
    ssl = shouldEnableSsl(
      connectionString,
      cfg.DATABASE_SSL as boolean | undefined,
    );
    idleTimeout = 30;
    connectTimeout = 2;
    max = cfg.DATABASE_POOL_MAX as number | undefined;
  }

  return postgres(connectionString, {
    ssl,
    idle_timeout: idleTimeout,
    connect_timeout: connectTimeout,
    ...(max !== undefined ? { max } : {}),
    onnotice: (notice: { message: string }) => {
      log.debug({ notice: notice.message }, 'Postgres notice');
    },
  });
}

/**
 * Creates a Kysely database instance wrapping an existing postgres.js connection.
 * Applies CamelCasePlugin by default for snake_case to camelCase mapping.
 * Pass `{ camelCase: false }` to disable it.
 */
export async function createDatabase<DB>(
  sql: import('postgres').Sql,
  options?: DatabaseOptions,
): Promise<import('kysely').Kysely<DB>> {
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types
  let kysely: any;
  try {
    kysely = await import('kysely');
  } catch {
    throw new Error(
      "telaio: createDatabase() requires 'kysely' to be installed. Run: pnpm add kysely",
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: peer dep types
  let kyselyPostgresJs: any;
  try {
    kyselyPostgresJs = await import('kysely-postgres-js');
  } catch {
    throw new Error(
      "telaio: createDatabase() requires 'kysely-postgres-js' to be installed. Run: pnpm add kysely-postgres-js",
    );
  }

  const dialect = new kyselyPostgresJs.PostgresJSDialect({ postgres: sql });

  const plugins = [
    ...(options?.camelCase !== false ? [new kysely.CamelCasePlugin()] : []),
    ...(options?.plugins ?? []),
  ];

  return new kysely.Kysely({ dialect, plugins });
}

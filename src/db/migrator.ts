import fs from 'node:fs/promises';
import path from 'node:path';
import type { MigrationProvider } from 'kysely/migration';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import type { Logger } from 'pino';
import { createLogger } from '../logger/index.js';

/** Options for creating a migrator. */
export interface MigratorOptions {
  /** Kysely database instance. */
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  db: any;
  /** Directory containing user migration files. */
  migrationsDir: string;
  /** Logger instance. */
  logger?: Logger;
  /** PostgreSQL schema for migration tracking tables. Defaults to public. */
  migrationTableSchema?: string;
  /** User migration table name. Defaults to 'kysely_migration'. */
  migrationTableName?: string;
  /** User migration lock table name. Defaults to 'kysely_migration_lock'. */
  migrationLockTableName?: string;
}

/** Result of a migration operation. */
export interface MigrationResult {
  migrationName: string;
  direction: string;
  status: 'Success' | 'Error' | 'NotExecuted';
}

/**
 * Creates a Kysely Migrator instance for user migrations.
 * Framework migrations are handled separately via `runFrameworkMigrations()`.
 */
export function createMigrator(options: MigratorOptions): Migrator {
  const schema =
    options.migrationTableSchema !== undefined &&
    options.migrationTableSchema !== 'public'
      ? options.migrationTableSchema
      : undefined;

  return new Migrator({
    db: options.db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: options.migrationsDir,
    }),
    ...(schema !== undefined && { migrationTableSchema: schema }),
    ...(options.migrationTableName !== undefined && {
      migrationTableName: options.migrationTableName,
    }),
    ...(options.migrationLockTableName !== undefined && {
      migrationLockTableName: options.migrationLockTableName,
    }),
  });
}

/**
 * Generates a timestamped migration file with up/down stubs.
 * Uses current timestamp for collision-free ordering.
 */
export async function createMigrationFile(
  name: string,
  migrationsDir: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name}.ts`;
  const filepath = path.join(migrationsDir, filename);

  await fs.mkdir(migrationsDir, { recursive: true });
  await fs.writeFile(
    filepath,
    `import type { Kysely } from 'kysely';

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function up(db: Kysely<any>): Promise<void> {
  // Migration code
}

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function down(db: Kysely<any>): Promise<void> {
  // Migration code
}
`,
  );

  return filename;
}

/**
 * Returns a MigrationProvider for framework migrations, built from
 * individual migration files in src/db/migrations/.
 *
 * Each migration file exports a `create(schema?)` factory so that
 * DDL can be schema-qualified when a custom schema is provided.
 */
export function createFrameworkMigrationProvider(
  schema?: string,
): MigrationProvider {
  // Defensive validation for programmatic callers that bypass Zod config
  if (schema !== undefined && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(
      `Invalid migration schema name "${schema}": must be a valid PostgreSQL identifier`,
    );
  }

  return {
    async getMigrations() {
      const citextExt = await import(
        './migrations/20250101000000_telaio_citext_extension.js'
      );
      const updatedAtTrigger = await import(
        './migrations/20250101000001_telaio_updated_at_trigger.js'
      );

      return {
        '20250101000000_telaio_citext_extension': citextExt.create(schema),
        '20250101000001_telaio_updated_at_trigger':
          updatedAtTrigger.create(schema),
      };
    },
  };
}

/**
 * Runs framework-owned migrations using an inline provider.
 * These run in a separate tracking table (_telaio_migrations) to avoid
 * conflicts with user migrations.
 */
export async function runFrameworkMigrations(
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  db: any,
  logger?: Logger,
  migrationTableSchema?: string,
): Promise<MigrationResult[]> {
  const log = logger ?? createLogger({ level: 'warn', pretty: false });

  const schema =
    migrationTableSchema !== undefined && migrationTableSchema !== 'public'
      ? migrationTableSchema
      : undefined;

  const migrator = new Migrator({
    db,
    provider: createFrameworkMigrationProvider(schema),
    migrationTableName: '_telaio_migrations',
    migrationLockTableName: '_telaio_migrations_lock',
    ...(schema !== undefined && { migrationTableSchema: schema }),
  });

  const { error, results } = await migrator.migrateToLatest();

  const output: MigrationResult[] = [];
  for (const result of results ?? []) {
    output.push({
      migrationName: result.migrationName,
      direction: result.direction,
      status: result.status,
    });

    if (result.status === 'Success') {
      log.info(
        `Framework migration "${result.migrationName}" executed (${result.direction})`,
      );
    } else if (result.status === 'Error') {
      log.error(`Framework migration "${result.migrationName}" failed`);
    }
  }

  if (error) {
    log.error({ error }, 'Framework migration failed');
    throw error;
  }

  return output;
}

/** Return type for migration operations that run framework + user migrations. */
export interface MigrateResult {
  framework: MigrationResult[];
  user: MigrationResult[];
}

/**
 * Collects Kysely migration results into MigrationResult[].
 * Throws if an error occurred during migration.
 */
function collectResults(
  results:
    | { migrationName: string; direction: string; status: string }[]
    | undefined,
  error: unknown,
  label: string,
  log: Logger,
): MigrationResult[] {
  const output: MigrationResult[] = [];
  for (const result of results ?? []) {
    output.push({
      migrationName: result.migrationName,
      direction: result.direction,
      status: result.status as MigrationResult['status'],
    });
  }

  if (error) {
    log.error({ error }, `${label} migration failed`);
    throw error;
  }

  return output;
}

/**
 * Runs user migrations to the latest version.
 * Framework migrations are run first automatically.
 */
export async function migrateToLatest(
  options: MigratorOptions,
): Promise<MigrateResult> {
  const log = options.logger ?? createLogger({ level: 'warn', pretty: false });
  const framework = await runFrameworkMigrations(
    options.db,
    log,
    options.migrationTableSchema,
  );
  const migrator = createMigrator(options);
  const { error, results } = await migrator.migrateToLatest();
  const user = collectResults(results, error, 'User', log);
  return { framework, user };
}

/**
 * Runs the next pending user migration (single step up).
 * Framework migrations are run first automatically.
 */
export async function migrateUp(
  options: MigratorOptions,
): Promise<MigrateResult> {
  const log = options.logger ?? createLogger({ level: 'warn', pretty: false });
  const framework = await runFrameworkMigrations(
    options.db,
    log,
    options.migrationTableSchema,
  );
  const migrator = createMigrator(options);
  const { error, results } = await migrator.migrateUp();
  const user = collectResults(results, error, 'User', log);
  return { framework, user };
}

/**
 * Rolls back the last executed user migration (single step down).
 * Framework migrations are run first automatically.
 */
export async function migrateDown(
  options: MigratorOptions,
): Promise<MigrateResult> {
  const log = options.logger ?? createLogger({ level: 'warn', pretty: false });
  const framework = await runFrameworkMigrations(
    options.db,
    log,
    options.migrationTableSchema,
  );
  const migrator = createMigrator(options);
  const { error, results } = await migrator.migrateDown();
  const user = collectResults(results, error, 'User', log);
  return { framework, user };
}

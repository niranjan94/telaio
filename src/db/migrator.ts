import fs from 'node:fs/promises';
import path from 'node:path';
import { FileMigrationProvider, Migrator } from 'kysely';
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
  return new Migrator({
    db: options.db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: options.migrationsDir,
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
 * Runs framework-owned migrations from telaio's built-in migration directory.
 * These run in a separate tracking table (_telaio_migrations) to avoid
 * conflicts with user migrations.
 */
export async function runFrameworkMigrations(
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  db: any,
  logger?: Logger,
): Promise<MigrationResult[]> {
  const log = logger ?? createLogger({ level: 'warn', pretty: false });
  const migrationFolder = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'migrations',
  );

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder,
    }),
    migrationTableName: '_telaio_migrations',
    migrationLockTableName: '_telaio_migrations_lock',
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

/**
 * Runs user migrations to the latest version.
 * Framework migrations are run first automatically.
 */
export async function migrateToLatest(
  options: MigratorOptions,
): Promise<{ framework: MigrationResult[]; user: MigrationResult[] }> {
  const log = options.logger ?? createLogger({ level: 'warn', pretty: false });

  // Run framework migrations first
  const framework = await runFrameworkMigrations(options.db, log);

  // Run user migrations
  const migrator = createMigrator(options);
  const { error, results } = await migrator.migrateToLatest();

  const user: MigrationResult[] = [];
  for (const result of results ?? []) {
    user.push({
      migrationName: result.migrationName,
      direction: result.direction,
      status: result.status,
    });
  }

  if (error) {
    log.error({ error }, 'User migration failed');
    throw error;
  }

  return { framework, user };
}

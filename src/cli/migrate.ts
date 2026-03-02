import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

import { resolveCliConfig } from './resolve-config.js';

/** Migration file template. */
const MIGRATION_TEMPLATE = `import type { Kysely } from 'kysely';

// biome-ignore lint/suspicious/noExplicitAny: Migrations cannot be aware of the database schema
export async function up(db: Kysely<any>): Promise<void> {
  // Migration code
}

// biome-ignore lint/suspicious/noExplicitAny: Migrations cannot be aware of the database schema
export async function down(db: Kysely<any>): Promise<void> {
  // Migration code
}
`;

/**
 * Generates a timestamp string for migration filenames.
 * Format: YYYYMMDDHHMMSS
 */
function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/** Registers the `telaio migrate` command group. */
export function registerMigrateCommand(program: Command): void {
  const migrate = program
    .command('migrate')
    .description('Database migration commands');

  migrate
    .command('create')
    .description('Create a new migration file')
    .argument('<name>', 'Name of the migration')
    .option('-d, --dir <directory>', 'Migration directory', 'src/db/migrations')
    .action(async (name: string, options: { dir: string }) => {
      const migrationDir = path.resolve(options.dir);
      await fs.mkdir(migrationDir, { recursive: true });

      const timestamp = generateTimestamp();
      const filename = `${timestamp}_${name}.ts`;
      const fullPath = path.join(migrationDir, filename);

      await fs.writeFile(fullPath, MIGRATION_TEMPLATE, 'utf-8');
      console.log(`Created migration: ${filename}`);
    });

  migrate
    .command('latest')
    .description('Run all pending migrations')
    .option('--force', 'Skip confirmation prompt')
    .option('-d, --dir <directory>', 'Migration directory', 'src/db/migrations')
    .action(async (options: { force?: boolean; dir: string }) => {
      await runMigration('latest', options);
    });

  migrate
    .command('up')
    .description('Run the next pending migration')
    .option('--force', 'Skip confirmation prompt')
    .option('-d, --dir <directory>', 'Migration directory', 'src/db/migrations')
    .action(async (options: { force?: boolean; dir: string }) => {
      await runMigration('up', options);
    });

  migrate
    .command('down')
    .description('Rollback the last migration')
    .option('--force', 'Skip confirmation prompt')
    .option('-d, --dir <directory>', 'Migration directory', 'src/db/migrations')
    .action(async (options: { force?: boolean; dir: string }) => {
      await runMigration('down', options);
    });

  migrate
    .command('status')
    .description('Show migration status')
    .option('-d, --dir <directory>', 'Migration directory', 'src/db/migrations')
    .action(async (options: { dir: string }) => {
      const appConfig = await resolveCliConfig(process.cwd());
      const { FileMigrationProvider, Migrator } = await importKysely();
      const db = await getDb(appConfig);
      const migrationDir = path.resolve(options.dir);

      const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
          fs,
          path,
          migrationFolder: migrationDir,
        }),
      });

      const migrations = await migrator.getMigrations();

      if (migrations.length === 0) {
        console.log('No migrations found.');
      } else {
        for (const m of migrations) {
          const status = m.executedAt ? 'executed' : 'pending';
          const date = m.executedAt
            ? ` (${new Date(m.executedAt).toISOString()})`
            : '';
          console.log(`  [${status}] ${m.name}${date}`);
        }
      }

      await db.destroy();
    });
}

/** Runs a migration in the specified direction. */
async function runMigration(
  direction: 'latest' | 'up' | 'down',
  options: { force?: boolean; dir: string },
): Promise<void> {
  if (!options.force) {
    // In non-force mode, ask for confirmation
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        `Are you sure you want to migrate ${direction}? (y/N) `,
        resolve,
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Migration cancelled.');
      return;
    }
  }

  const appConfig = await resolveCliConfig(process.cwd());
  const { FileMigrationProvider, Migrator } = await importKysely();
  const db = await getDb(appConfig);
  const migrationDir = path.resolve(options.dir);

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationDir,
    }),
  });

  const { error, results } =
    direction === 'latest'
      ? await migrator.migrateToLatest()
      : direction === 'up'
        ? await migrator.migrateUp()
        : await migrator.migrateDown();

  if (results) {
    for (const r of results) {
      if (r.status === 'Success') {
        console.log(`  [ok] ${r.migrationName} (${r.direction})`);
      } else if (r.status === 'Error') {
        console.error(`  [fail] ${r.migrationName}`);
      }
    }
  }

  if (error) {
    console.error('Migration failed:', error);
    await db.destroy();
    process.exit(1);
  }

  if (results && results.length === 0) {
    console.log('No migrations to execute.');
  }

  await db.destroy();
}

/** Dynamically imports Kysely (peer dep). */
async function importKysely() {
  try {
    const mod = await import('kysely');
    return {
      FileMigrationProvider: mod.FileMigrationProvider,
      Migrator: mod.Migrator,
    };
  } catch {
    throw new Error(
      "telaio: migrate commands require 'kysely' to be installed. Run: pnpm add kysely",
    );
  }
}

/** Gets a Kysely database instance from the resolved app config. */
async function getDb(appConfig: Record<string, unknown>) {
  const connectionString = appConfig.DATABASE_URL as string | undefined;
  if (!connectionString) {
    throw new Error(
      'telaio: DATABASE_URL is required for migrations. ' +
        'Set it in your .env or telaio.config.ts.',
    );
  }

  const { createPool, createDatabase } = await import('../db/client.js');
  const pool = await createPool({ connectionString });
  return createDatabase(pool);
}

import path from 'node:path';
import type { Command } from 'commander';

import { resolveCliConfig } from './resolve-config.js';

/** Dynamically imports the migrator module (requires kysely peer dep). */
async function importMigrator() {
  try {
    return await import('../db/migrator.js');
  } catch {
    throw new Error(
      "telaio: migrate commands require 'kysely' to be installed. Run: pnpm add kysely",
    );
  }
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
      const { createMigrationFile } = await importMigrator();
      const filename = await createMigrationFile(name, migrationDir);
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
      const { createMigrator } = await importMigrator();
      const db = await getDb(appConfig);
      const migrationDir = path.resolve(options.dir);

      const migrator = createMigrator({ db, migrationsDir: migrationDir });
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

/** Prints migration results with prefix labels. */
function printResults(
  results: { migrationName: string; direction: string; status: string }[],
  prefix: string,
): void {
  for (const r of results) {
    if (r.status === 'Success') {
      console.log(`  [${prefix}:ok] ${r.migrationName} (${r.direction})`);
    } else if (r.status === 'Error') {
      console.error(`  [${prefix}:fail] ${r.migrationName}`);
    }
  }
}

/** Runs a migration in the specified direction. */
async function runMigration(
  direction: 'latest' | 'up' | 'down',
  options: { force?: boolean; dir: string },
): Promise<void> {
  if (!options.force) {
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
  const { migrateToLatest, migrateUp, migrateDown } = await importMigrator();
  const db = await getDb(appConfig);
  const migrationDir = path.resolve(options.dir);

  const migratorOptions = { db, migrationsDir: migrationDir };

  try {
    const { framework, user } =
      direction === 'latest'
        ? await migrateToLatest(migratorOptions)
        : direction === 'up'
          ? await migrateUp(migratorOptions)
          : await migrateDown(migratorOptions);

    printResults(framework, 'framework');
    printResults(user, 'user');

    if (framework.length === 0 && user.length === 0) {
      console.log('No migrations to execute.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    await db.destroy();
    process.exit(1);
  }

  await db.destroy();
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

  const camelCase = appConfig.DATABASE_CAMEL_CASE as boolean | undefined;

  const { createPool, createDatabase } = await import('../db/client.js');
  const pool = await createPool({ connectionString });
  return createDatabase(pool, { camelCase });
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDatabase, createPool } from '../../src/db/client.js';
import {
  migrateToLatest,
  runFrameworkMigrations,
} from '../../src/db/migrator.js';
import { createLogger } from '../../src/logger/index.js';

const skipE2e = inject('skipE2e');
const databaseUrl = skipE2e ? '' : inject('databaseUrl');

const logger = createLogger({ level: 'silent', pretty: false });

describe.skipIf(skipE2e)('migrations (E2E)', () => {
  let pool: import('postgres').Sql;
  // biome-ignore lint/suspicious/noExplicitAny: generic database type
  let db: import('kysely').Kysely<any>;

  beforeEach(async () => {
    pool = await createPool({ connectionString: databaseUrl });
    db = await createDatabase(pool);
  });

  afterEach(async () => {
    // Clean up migration tracking tables between tests
    await sql`DROP TABLE IF EXISTS _telaio_migrations_lock CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS _telaio_migrations CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS kysely_migration_lock CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS kysely_migration CASCADE`.execute(db);
    await db.destroy();
    await pool.end();
  });

  it('runs framework migrations against real PostgreSQL', async () => {
    const results = await runFrameworkMigrations(db, logger);
    expect(results.length).toBeGreaterThan(0);

    // All framework migrations should succeed
    for (const r of results) {
      expect(r.status).toBe('Success');
    }

    // Verify the citext extension was created
    const { rows } = await sql`
      SELECT 1 FROM pg_extension WHERE extname = 'citext'
    `.execute(db);
    expect(rows).toHaveLength(1);
  });

  it('framework migrations are idempotent', async () => {
    // Run twice — second run should be a no-op
    const first = await runFrameworkMigrations(db, logger);
    expect(first.length).toBeGreaterThan(0);

    const second = await runFrameworkMigrations(db, logger);
    expect(second).toHaveLength(0);
  });

  it('parses citext array columns as string arrays without manual parser registration', async () => {
    // This test verifies that postgres.js handles citext arrays natively,
    // which was previously done by registerCitextParser with node-postgres (pg).
    await runFrameworkMigrations(db, logger); // creates citext extension

    // Create a table with a citext[] column
    await sql`CREATE TABLE citext_test (
      id serial PRIMARY KEY,
      tags citext[]
    )`.execute(db);

    // Insert array data
    await sql`INSERT INTO citext_test (tags) VALUES (ARRAY['Hello', 'World']::citext[])`.execute(
      db,
    );

    // Read it back via Kysely
    const { rows } =
      await sql`SELECT tags FROM citext_test WHERE id = 1`.execute(db);
    const tags = rows[0]?.tags;

    // The critical assertion: tags should be a JS array, not a raw string like '{Hello,World}'
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toEqual(['Hello', 'World']);

    // Also verify case-insensitive behavior is preserved in the array values
    const { rows: ciRows } = await sql`
      SELECT tags FROM citext_test WHERE 'hello' = ANY(tags)
    `.execute(db);
    expect(ciRows).toHaveLength(1);

    // Clean up
    await sql`DROP TABLE IF EXISTS citext_test`.execute(db);
  });

  it('runs user migrations from a directory', async () => {
    // Create a temp directory with a test migration using raw SQL (no kysely import)
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'telaio-migrate-e2e-'),
    );

    // Use Kysely's Migration interface shape (up/down receiving db)
    // without importing 'kysely' in the migration file itself.
    // Kysely passes the db instance at runtime, so we just use db.executeQuery.
    const migrationContent = `
export async function up(db) {
  await db.schema
    .createTable('e2e_test_table')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db) {
  await db.schema.dropTable('e2e_test_table').execute();
}
`;

    await fs.writeFile(
      path.join(tmpDir, '20250101000000_create_e2e_test.ts'),
      migrationContent,
      'utf-8',
    );

    const result = await migrateToLatest({
      db,
      migrationsDir: tmpDir,
      logger,
    });

    // Framework migrations ran
    expect(result.framework.length).toBeGreaterThanOrEqual(0);

    // User migration ran
    expect(result.user).toHaveLength(1);
    expect(result.user[0].status).toBe('Success');

    // Verify the table exists
    const { rows } = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'e2e_test_table'
    `.execute(db);
    expect(rows).toHaveLength(1);

    // Clean up
    await sql`DROP TABLE IF EXISTS e2e_test_table`.execute(db);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

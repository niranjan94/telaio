import { describe, expect, it } from 'vitest';
import { createLogger } from '../../logger/index.js';
import { createDatabase, createPool } from '../client.js';

const logger = createLogger({ level: 'silent', pretty: false });

describe('createPool', () => {
  it('creates a sql instance from direct options', async () => {
    const sql = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(sql).toBeDefined();
    expect(typeof sql.end).toBe('function');
    await sql.end();
  });

  it('creates a sql instance from config-style object', async () => {
    const sql = await createPool(
      { DATABASE_URL: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(sql).toBeDefined();
    await sql.end();
  });

  it('falls back to default connection string when DATABASE_URL not provided', async () => {
    const sql = await createPool({}, logger);
    expect(sql).toBeDefined();
    await sql.end();
  });
});

describe('createDatabase', () => {
  it('creates a Kysely instance from a sql instance', async () => {
    const sql = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(sql);
    expect(db).toBeDefined();
    expect(typeof db.selectFrom).toBe('function');
    expect(typeof db.destroy).toBe('function');
    await db.destroy();
    await sql.end();
  });

  it('includes CamelCasePlugin by default', async () => {
    const sql = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(sql);
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal plugins for test assertion
    const plugins = (db as any).getExecutor().plugins;
    const hasCamelCase = plugins.some(
      // biome-ignore lint/suspicious/noExplicitAny: plugin constructor name check
      (p: any) => p.constructor.name === 'CamelCasePlugin',
    );
    expect(hasCamelCase).toBe(true);
    await db.destroy();
    await sql.end();
  });

  it('omits CamelCasePlugin when camelCase is false', async () => {
    const sql = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(sql, { camelCase: false });
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal plugins for test assertion
    const plugins = (db as any).getExecutor().plugins;
    const hasCamelCase = plugins.some(
      // biome-ignore lint/suspicious/noExplicitAny: plugin constructor name check
      (p: any) => p.constructor.name === 'CamelCasePlugin',
    );
    expect(hasCamelCase).toBe(false);
    await db.destroy();
    await sql.end();
  });
});

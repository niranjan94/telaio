import { describe, expect, it } from 'vitest';
import { createLogger } from '../../logger/index.js';
import { createDatabase, createPool } from '../client.js';

const logger = createLogger({ level: 'silent', pretty: false });

describe('createPool', () => {
  it('creates a pool from direct options', async () => {
    const pool = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(pool).toBeDefined();
    expect(typeof pool.end).toBe('function');
    pool.end();
  });

  it('creates a pool from config-style object', async () => {
    const pool = await createPool(
      { DATABASE_URL: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(pool).toBeDefined();
    pool.end();
  });

  it('falls back to default connection string when DATABASE_URL not provided', async () => {
    // Should not throw — uses default 'postgresql://localhost/app'
    const pool = await createPool({}, logger);
    expect(pool).toBeDefined();
    pool.end();
  });
});

describe('createDatabase', () => {
  it('creates a Kysely instance from a pool', async () => {
    const pool = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(pool);
    expect(db).toBeDefined();
    expect(typeof db.selectFrom).toBe('function');
    expect(typeof db.destroy).toBe('function');
    pool.end();
  });

  it('includes CamelCasePlugin by default', async () => {
    const pool = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(pool);
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal plugins for test assertion
    const plugins = (db as any).getExecutor().plugins;
    const hasCamelCase = plugins.some(
      // biome-ignore lint/suspicious/noExplicitAny: plugin constructor name check
      (p: any) => p.constructor.name === 'CamelCasePlugin',
    );
    expect(hasCamelCase).toBe(true);
    pool.end();
  });

  it('omits CamelCasePlugin when camelCase is false', async () => {
    const pool = await createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = await createDatabase(pool, { camelCase: false });
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal plugins for test assertion
    const plugins = (db as any).getExecutor().plugins;
    const hasCamelCase = plugins.some(
      // biome-ignore lint/suspicious/noExplicitAny: plugin constructor name check
      (p: any) => p.constructor.name === 'CamelCasePlugin',
    );
    expect(hasCamelCase).toBe(false);
    pool.end();
  });
});

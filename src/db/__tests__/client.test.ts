import { describe, expect, it } from 'vitest';
import { createLogger } from '../../logger/index.js';
import { createDatabase, createPool } from '../client.js';

const logger = createLogger({ level: 'silent', pretty: false });

describe('createPool', () => {
  it('creates a pool from direct options', () => {
    const pool = createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(pool).toBeDefined();
    expect(typeof pool.end).toBe('function');
    pool.end();
  });

  it('creates a pool from config-style object', () => {
    const pool = createPool(
      { DATABASE_URL: 'postgresql://localhost:5432/test' },
      logger,
    );
    expect(pool).toBeDefined();
    pool.end();
  });

  it('falls back to default connection string when DATABASE_URL not provided', () => {
    // Should not throw — uses default 'postgresql://localhost/app'
    const pool = createPool({}, logger);
    expect(pool).toBeDefined();
    pool.end();
  });
});

describe('createDatabase', () => {
  it('creates a Kysely instance from a pool', () => {
    const pool = createPool(
      { connectionString: 'postgresql://localhost:5432/test' },
      logger,
    );
    const db = createDatabase(pool);
    expect(db).toBeDefined();
    expect(typeof db.selectFrom).toBe('function');
    expect(typeof db.destroy).toBe('function');
    pool.end();
  });
});

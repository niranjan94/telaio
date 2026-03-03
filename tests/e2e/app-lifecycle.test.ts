import { sql } from 'kysely';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../src/builder.js';
import { createLogger } from '../../src/logger/index.js';

const skipE2e = inject('skipE2e');
const databaseUrl = skipE2e ? '' : inject('databaseUrl');
const redisUrl = skipE2e ? '' : inject('redisUrl');

const logger = createLogger({ level: 'silent', pretty: false });

describe.skipIf(skipE2e)('app lifecycle (E2E)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let app: any;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = null;
    }
  });

  it('builds and starts a minimal app', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    await app.start({ port: 0 });
    const addresses = app.fastify.addresses();
    expect(addresses.length).toBeGreaterThan(0);
  });

  it('builds app with database and runs a query', async () => {
    app = await createApp({
      config: { DATABASE_URL: databaseUrl },
      logger,
    })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .withDatabase()
      .build();

    const { rows } = await sql`SELECT 1 AS value`.execute(app.db);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1);
  });

  it('builds app with database and verifies arithmetic via SQL', async () => {
    app = await createApp({
      config: { DATABASE_URL: databaseUrl },
      logger,
    })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .withDatabase()
      .build();

    const { rows } = await sql`SELECT 1 + 1 AS sum`.execute(app.db);
    expect(rows[0].sum).toBe(2);
  });

  it('builds app with cache and performs get/set', async () => {
    app = await createApp({
      config: { REDIS_URL: redisUrl, REDIS_ENABLED: true },
      logger,
    })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .withCache()
      .build();

    await app.cache.set('e2e-test-key', 'hello-world', 60);
    const value = await app.cache.get('e2e-test-key');
    expect(value).toBe('hello-world');

    await app.cache.delete('e2e-test-key');
    const deleted = await app.cache.get('e2e-test-key');
    expect(deleted).toBeNull();
  });

  it('builds app with database + cache together', async () => {
    app = await createApp({
      config: {
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        REDIS_ENABLED: true,
      },
      logger,
    })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .withDatabase()
      .withCache()
      .build();

    expect(app.pool).toBeDefined();
    expect(app.db).toBeDefined();
    expect(app.cache).toBeDefined();

    const { rows } = await sql`SELECT current_database() AS db`.execute(app.db);
    expect(rows[0].db).toBe('telaio_e2e');

    await app.cache.set('db-name', rows[0].db, 60);
    const cached = await app.cache.get('db-name');
    expect(cached).toBe('telaio_e2e');
  });

  it('health endpoint works on started app', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('stop gracefully shuts down all resources', async () => {
    app = await createApp({
      config: {
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        REDIS_ENABLED: true,
      },
      logger,
    })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .withDatabase()
      .withCache()
      .build();

    await app.start({ port: 0 });

    // Verify server is listening
    const addresses = app.fastify.addresses();
    expect(addresses.length).toBeGreaterThan(0);

    // Stop should complete without throwing
    await expect(app.stop()).resolves.toBeUndefined();
    app = null; // prevent double-close in afterEach
  });
});

import type { Kysely } from 'kysely';
import type { Pool } from 'pg';
import { describe, expectTypeOf, it } from 'vitest';
import { type AppBuilder, createApp } from '../../src/builder.js';
import type { DefaultFeatures, TelaioApi, TelaioConsumer, TelaioApp } from '../../src/types.js';

describe('builder phantom types', () => {
  it('createApp returns a builder with all features disabled', () => {
    const builder = createApp();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<DefaultFeatures, unknown, Record<string, never>>
    >();
  });

  it('withDatabase enables the database feature', () => {
    const builder = createApp().withDatabase();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { database: true },
        unknown,
        Record<string, never>
      >
    >();
  });

  it('withCache enables the cache feature', () => {
    const builder = createApp().withCache();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { cache: true },
        unknown,
        Record<string, never>
      >
    >();
  });

  it('withQueues enables the queue feature', () => {
    const registry = {
      testQueue: async () => {},
    };
    const builder = createApp().withQueues(registry);
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { queue: true },
        unknown,
        Record<string, never>
      >
    >();
  });

  it('chaining multiple features composes the type', () => {
    const builder = createApp().withDatabase().withCache();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { database: true } & { cache: true },
        unknown,
        Record<string, never>
      >
    >();
  });

  it('app built with withDatabase has pool and db', async () => {
    const app = {} as TelaioApp<
      DefaultFeatures & { database: true },
      unknown,
      Record<string, never>
    >;
    expectTypeOf(app.pool).toEqualTypeOf<Pool>();
    expectTypeOf(app.db).toEqualTypeOf<Kysely<unknown>>();
  });

  it('app built without withDatabase does not have pool or db', async () => {
    const app = {} as TelaioApp<
      DefaultFeatures,
      unknown,
      Record<string, never>
    >;
    expectTypeOf(app).not.toHaveProperty('pool');
    expectTypeOf(app).not.toHaveProperty('db');
  });

  it('app always has core properties', async () => {
    const app = {} as TelaioApp<
      DefaultFeatures,
      unknown,
      Record<string, never>
    >;
    expectTypeOf(app.fastify).toBeObject();
    expectTypeOf(app.logger).toBeObject();
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();
  });

  it('config type is preserved through the builder', () => {
    type MyConfig = { APP_NAME: string; DATABASE_URL: string };
    const builder = createApp<MyConfig>();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<DefaultFeatures, unknown, MyConfig>
    >();
  });

  it('config type is accessible on the built app', async () => {
    type MyConfig = { APP_NAME: string; PORT: number };
    const app = {} as TelaioApp<DefaultFeatures, unknown, MyConfig>;
    expectTypeOf(app.config).toEqualTypeOf<MyConfig>();
  });
});

describe('TelaioApi type', () => {
  it('has fastify, config, logger, start, stop', () => {
    const app = {} as TelaioApi<DefaultFeatures, unknown, Record<string, never>>;
    expectTypeOf(app.fastify).toBeObject();
    expectTypeOf(app.config).toEqualTypeOf<Record<string, never>>();
    expectTypeOf(app.logger).toBeObject();
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();
  });

  it('with database has pool and db', () => {
    const app = {} as TelaioApi<DefaultFeatures & { database: true }, unknown, Record<string, never>>;
    expectTypeOf(app.pool).toEqualTypeOf<Pool>();
    expectTypeOf(app.db).toEqualTypeOf<Kysely<unknown>>();
  });
});

describe('TelaioConsumer type', () => {
  it('has config, logger, start, stop but no fastify', () => {
    const app = {} as TelaioConsumer<DefaultFeatures, Record<string, never>>;
    expectTypeOf(app.config).toEqualTypeOf<Record<string, never>>();
    expectTypeOf(app.logger).toBeObject();
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();
    expectTypeOf(app).not.toHaveProperty('fastify');
  });

  it('with database has pool and db', () => {
    const app = {} as TelaioConsumer<DefaultFeatures & { database: true }, Record<string, never>>;
    expectTypeOf(app.pool).toEqualTypeOf<Pool>();
    expectTypeOf(app.db).toEqualTypeOf<Kysely<unknown>>();
  });

  it('does not have auth', () => {
    const app = {} as TelaioConsumer<DefaultFeatures & { auth: true }, Record<string, never>>;
    expectTypeOf(app).not.toHaveProperty('auth');
  });
});

describe('buildConsumer phantom type constraint', () => {
  it('buildConsumer() is not callable without withQueues()', () => {
    const builder = createApp();
    // @ts-expect-error -- buildConsumer requires queue feature
    expectTypeOf(builder.buildConsumer).toBeFunction();
  });

  it('buildConsumer() is callable after withQueues()', () => {
    const registry = { testQueue: async () => {} };
    const builder = createApp().withQueues(registry);
    expectTypeOf(builder.buildConsumer).toBeFunction();
  });
});

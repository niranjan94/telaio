import { Type } from 'typebox';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/builder.js';
import { ErrorCode, NotFoundError } from '../../src/errors/index.js';
import { createLogger } from '../../src/logger/index.js';

/** Quiet logger so tests don't spam the console. */
const logger = createLogger({ level: 'silent', pretty: false });

describe('error handling', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let app: any;

  afterEach(async () => {
    if (app?.fastify) {
      await app.fastify.close();
    }
  });

  it('returns 422 with validation details for invalid request body', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    const BodySchema = Type.Object({
      name: Type.String({ minLength: 1 }),
      age: Type.Number({ minimum: 0 }),
    });

    app.fastify.post('/items', {
      schema: {
        body: BodySchema,
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => ({ ok: true }),
    });

    const response = await app.fastify.inject({
      method: 'POST',
      url: '/items',
      payload: { name: 123, age: 'not-a-number' },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    expect(body.message).toBe('Validation failed');
    expect(body.validation).toBeDefined();
    expect(Array.isArray(body.validation)).toBe(true);
    expect(body.validation.length).toBeGreaterThan(0);
  });

  it('returns 422 for missing required fields', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/items', {
      schema: {
        body: Type.Object({
          name: Type.String(),
          email: Type.String({ format: 'email' }),
        }),
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => ({ ok: true }),
    });

    // Empty body -- missing required fields
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/items',
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    expect(body.validation.length).toBeGreaterThan(0);
  });

  it('onRoute hook injects default error schemas into route response', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    // Capture the route schema after onRoute hook has mutated it
    const routeSchema = {
      response: {
        200: Type.Object({ ok: Type.Boolean() }),
      },
    };

    app.fastify.get('/with-schema', {
      schema: routeSchema,
      handler: async () => ({ ok: true }),
    });

    // The onRoute hook should have injected default error schemas
    const response = routeSchema.response as Record<string, unknown>;
    expect(response[200]).toBeDefined();
    expect(response[400]).toBeDefined();
    expect(response[404]).toBeDefined();
    expect(response[413]).toBeDefined();
    expect(response[422]).toBeDefined();
    expect(response[429]).toBeDefined();
    expect(response[500]).toBeDefined();
  });

  it('onRoute hook does not overwrite user-provided error schemas', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    const custom500 = Type.Object({ error: Type.String() });
    const routeSchema = {
      response: {
        200: Type.Object({ ok: Type.Boolean() }),
        500: custom500,
      } as Record<string, unknown>,
    };

    app.fastify.get('/custom-errors', {
      schema: routeSchema,
      handler: async () => ({ ok: true }),
    });

    // 500 should remain the custom schema
    expect(routeSchema.response[500]).toBe(custom500);
    // Other defaults should be injected
    expect(routeSchema.response[400]).toBeDefined();
    expect(routeSchema.response[422]).toBeDefined();
  });

  it('serializes RequestError subclasses correctly on routes with response schemas', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.get('/not-found', {
      schema: {
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => {
        throw new NotFoundError('item vanished');
      },
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/not-found',
    });

    // Should get 404, not 500 FST_ERR_FAILED_ERROR_SERIALIZATION
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.NOT_FOUND);
    expect(body.message).toBe('item vanished');
  });

  it('serializes unhandled errors as 500 on routes with response schemas', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.get('/crash', {
      schema: {
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => {
        throw new Error('kaboom');
      },
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/crash',
    });

    // Should get 500, not FST_ERR_FAILED_ERROR_SERIALIZATION
    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.ERROR);
    expect(body.logId).toBeDefined();
  });
});

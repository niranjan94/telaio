import { Type } from 'typebox';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/builder.js';
import { ErrorCode, NotFoundError } from '../../src/errors/index.js';
import { createLogger } from '../../src/logger/index.js';

const logger = createLogger({ level: 'silent', pretty: false });

/** Extracts the base URL from a running Fastify server. */
// biome-ignore lint/suspicious/noExplicitAny: test helper
function baseUrl(app: any): string {
  const addr = app.fastify.addresses()[0];
  return `http://localhost:${addr.port}`;
}

describe('error handling (E2E)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let app: any;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = null;
    }
  });

  it('returns 422 with validation details for invalid request body', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/items', {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          age: Type.Number({ minimum: 0 }),
        }),
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => ({ ok: true }),
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 123, age: 'not-a-number' }),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    expect(body.message).toBe('Validation failed');
    expect(Array.isArray(body.validation)).toBe(true);
    expect(body.validation.length).toBeGreaterThan(0);
  });

  it('returns 422 for missing required fields', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/users', {
      schema: {
        body: Type.Object({
          name: Type.String(),
          email: Type.String({ format: 'email' }),
        }),
        response: {
          200: Type.Object({ id: Type.String() }),
        },
      },
      handler: async () => ({ id: '1' }),
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    expect(body.validation.length).toBeGreaterThan(0);
  });

  it('returns 404 for RequestError, not 500 serialization error', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.get('/missing', {
      schema: {
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => {
        throw new NotFoundError('item vanished');
      },
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/missing`);

    // Must be 404, not 500 FST_ERR_FAILED_ERROR_SERIALIZATION
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.NOT_FOUND);
    expect(body.message).toBe('item vanished');
  });

  it('returns 500 with logId for unhandled errors, not serialization error', async () => {
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

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/crash`);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.ERROR);
    expect(body.message).toBe('An error occurred');
    expect(body.logId).toBeDefined();
  });

  it('returns 400 for empty body with content-type application/json', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/items', {
      schema: {
        body: Type.Object({ name: Type.String() }),
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => ({ ok: true }),
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    // Fastify rejects empty JSON body with 400, not 500
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('error');
  });

  it('returns 422 for empty body without content-type header', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/items', {
      schema: {
        body: Type.Object({ name: Type.String() }),
        response: {
          200: Type.Object({ ok: Type.Boolean() }),
        },
      },
      handler: async () => ({ ok: true }),
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/items`, {
      method: 'POST',
    });

    // No content-type means no parser runs; body is undefined, fails validation
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    expect(body.validation.length).toBeGreaterThan(0);
  });

  it('successful route still works after error schema injection', async () => {
    app = await createApp({ logger })
      .withSchemas(false)
      .withPlugins({ autoload: false })
      .build();

    app.fastify.post('/items', {
      schema: {
        body: Type.Object({
          name: Type.String(),
        }),
        response: {
          200: Type.Object({ ok: Type.Boolean(), name: Type.String() }),
        },
      },
      handler: async (req: any) => ({
        ok: true,
        // biome-ignore lint/suspicious/noExplicitAny: test helper
        name: (req.body as any).name,
      }),
    });

    await app.start({ port: 0 });

    const response = await fetch(`${baseUrl(app)}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test-item' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.name).toBe('test-item');
  });
});

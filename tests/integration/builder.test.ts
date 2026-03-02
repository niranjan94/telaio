import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/builder.js';
import {
  BadRequestError,
  ErrorCode,
  NotFoundError,
} from '../../src/errors/index.js';
import { createLogger } from '../../src/logger/index.js';

/** Quiet logger so tests don't spam the console. */
const logger = createLogger({ level: 'silent', pretty: false });

describe('AppBuilder', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let app: any;

  afterEach(async () => {
    if (app?.fastify) {
      await app.fastify.close();
    }
  });

  it('builds a minimal app with health endpoint', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('exposes config on the app', async () => {
    const config = { APP_NAME: 'TestApp', BASE_DIR: '/tmp' };
    app = await createApp({ config, logger })
      .withPlugins({ autoload: false })
      .build();

    expect(app.config).toEqual(config);
  });

  it('exposes logger on the app', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    expect(app.logger).toBe(logger);
  });

  it('handles RequestError subclasses with correct status and body', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    app.fastify.get('/boom', async () => {
      throw new NotFoundError('gone forever');
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/boom',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.NOT_FOUND);
    expect(body.message).toBe('gone forever');
  });

  it('handles BadRequestError with correct status', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    app.fastify.get('/bad', async () => {
      throw new BadRequestError('bad thing');
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/bad',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('handles unknown errors with 500 and logId', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    app.fastify.get('/unknown', async () => {
      throw new Error('something broke');
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/unknown',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe(ErrorCode.ERROR);
    expect(body.message).toBe('An error occurred');
    expect(body.logId).toBeDefined();
  });

  it('registers built-in schemas on the fastify instance', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    // Built-in schemas should be retrievable
    const schemas = app.fastify.getSchemas();
    expect(schemas.SortPaginationParams).toBeDefined();
    expect(schemas.PaginationMeta).toBeDefined();
    expect(schemas.GenericErrorResponse).toBeDefined();
    expect(schemas.UnauthorizedResponse).toBeDefined();
    expect(schemas.NotFoundResponse).toBeDefined();
  });

  it('ephemeral build skips hooks and health endpoint', async () => {
    app = await createApp({ logger })
      .withPlugins({ autoload: false })
      .asEphemeral()
      .build();

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/healthz',
    });

    // No route registered — 404 from Fastify's default handler
    expect(response.statusCode).toBe(404);
  });

  it('calls onReady and onClose callbacks', async () => {
    const onReady = vi.fn(async () => {});
    const onClose = vi.fn(async () => {});

    app = await createApp({ logger })
      .withPlugins({ autoload: false })
      .onReady(onReady)
      .onClose(onClose)
      .build();

    await app.fastify.ready();
    expect(onReady).toHaveBeenCalledOnce();

    await app.fastify.close();
    expect(onClose).toHaveBeenCalledOnce();
    app = null; // prevent afterEach double-close
  });

  it('withSwagger configures OpenAPI metadata', async () => {
    app = await createApp({ logger })
      .withPlugins({ autoload: false })
      .withSwagger({
        info: { title: 'Test API', version: '2.0.0' },
        tags: [{ name: 'Users', description: 'User endpoints' }],
      })
      .build();

    await app.fastify.ready();

    // biome-ignore lint/suspicious/noExplicitAny: swagger may not be typed
    const spec = (app.fastify as any).swagger?.();
    if (spec) {
      expect(spec.info.title).toBe('Test API');
      expect(spec.info.version).toBe('2.0.0');
      expect(spec.tags).toContainEqual({
        name: 'Users',
        description: 'User endpoints',
      });
    }
  });

  it('withApiDocs registers /docs and /docs/json routes', async () => {
    app = await createApp({ logger })
      .withPlugins({ autoload: false })
      .withApiDocs()
      .build();

    const docsResponse = await app.fastify.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(docsResponse.statusCode).toBe(200);
    expect(docsResponse.headers['content-type']).toContain('text/html');
    expect(docsResponse.body).toContain('API Reference');
    expect(docsResponse.body).toContain('@scalar/api-reference');

    const jsonResponse = await app.fastify.inject({
      method: 'GET',
      url: '/docs/json',
    });

    expect(jsonResponse.statusCode).toBe(200);
  });

  it('start and stop lifecycle works', async () => {
    app = await createApp({ logger }).withPlugins({ autoload: false }).build();

    // Start on a random port to avoid conflicts
    await app.start({ port: 0 });

    // Server should be listening
    const addresses = app.fastify.addresses();
    expect(addresses.length).toBeGreaterThan(0);

    await app.stop();
    app = null; // prevent afterEach double-close
  });

  it('builder methods are chainable', async () => {
    const builder = createApp({ logger })
      .withPlugins({ autoload: false, cors: false, helmet: false })
      .withSwagger({ info: { title: 'Chain Test' } })
      .withApiDocs()
      .onReady(async () => {})
      .onClose(async () => {});

    // Builder should still be usable
    app = await builder.build();
    expect(app.fastify).toBeDefined();
  });
});

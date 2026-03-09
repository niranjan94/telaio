import { describe, expect, it, vi } from 'vitest';
import { registerDefaultErrorSchemas } from '../hooks.js';

describe('registerDefaultErrorSchemas', () => {
  it('injects default error schemas into routes with existing response schemas', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock route options
    let capturedHook: any;
    const server = {
      addHook: vi.fn((name: string, fn: unknown) => {
        if (name === 'onRoute') capturedHook = fn;
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock fastify
    registerDefaultErrorSchemas(server as any);
    expect(server.addHook).toHaveBeenCalledWith(
      'onRoute',
      expect.any(Function),
    );

    // Simulate a route with a 200 response schema but no error schemas
    const routeOptions = {
      schema: {
        response: {
          200: { type: 'object' },
        },
      },
    };

    capturedHook(routeOptions);

    const response = routeOptions.schema.response as Record<string, unknown>;
    expect(response[200]).toEqual({ type: 'object' });
    expect(response[400]).toBeDefined();
    expect(response[404]).toBeDefined();
    expect(response[413]).toBeDefined();
    expect(response[422]).toBeDefined();
    expect(response[429]).toBeDefined();
    expect(response[500]).toBeDefined();
  });

  it('does not overwrite existing error schemas', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock route options
    let capturedHook: any;
    const server = {
      addHook: vi.fn((_name: string, fn: unknown) => {
        capturedHook = fn;
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock fastify
    registerDefaultErrorSchemas(server as any);

    const custom400 = { type: 'object', properties: { custom: true } };
    const routeOptions = {
      schema: {
        response: {
          200: { type: 'object' },
          400: custom400,
        },
      },
    };

    capturedHook(routeOptions);

    // 400 should remain the custom one
    expect(routeOptions.schema.response[400]).toBe(custom400);
    // Others should be injected
    expect(routeOptions.schema.response[404]).toBeDefined();
  });

  it('skips routes with no response schemas', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock route options
    let capturedHook: any;
    const server = {
      addHook: vi.fn((_name: string, fn: unknown) => {
        capturedHook = fn;
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock fastify
    registerDefaultErrorSchemas(server as any);

    // Route with no schema at all
    const noSchema = { schema: undefined };
    capturedHook(noSchema);
    expect(noSchema.schema).toBeUndefined();

    // Route with schema but no response
    const noResponse = { schema: {} };
    capturedHook(noResponse);
    expect(
      (noResponse.schema as Record<string, unknown>).response,
    ).toBeUndefined();

    // Route with empty response
    const emptyResponse = { schema: { response: {} } };
    capturedHook(emptyResponse);
    expect(Object.keys(emptyResponse.schema.response)).toHaveLength(0);
  });
});

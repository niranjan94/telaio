import type { FastifyInstance } from 'fastify';

/** Options for OpenAPI/Swagger configuration. */
export interface SwaggerOptions {
  openapi?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  tags?: Array<{ name: string; description?: string }>;
  securitySchemes?: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  hideUntagged?: boolean;
  hiddenTag?: string;
}

/**
 * Registers @fastify/swagger with the provided configuration.
 * Silently skips if @fastify/swagger is not installed.
 */
export async function registerSwagger(
  server: FastifyInstance,
  options: SwaggerOptions = {},
) {
  let fastifySwagger: { default: unknown };
  try {
    const moduleName = '@fastify/swagger';
    fastifySwagger = await import(/* webpackIgnore: true */ moduleName);
  } catch {
    return;
  }

  // biome-ignore lint/suspicious/noExplicitAny: peer dep type
  await server.register(fastifySwagger.default as any, {
    stripBasePath: true,
    openapi: {
      openapi: options.openapi ?? '3.1.0',
      servers: options.servers ?? [],
      info: {
        title: options.info?.title ?? 'API',
        description: options.info?.description ?? 'API',
        version: options.info?.version ?? '1.0.0',
      },
      tags: options.tags ?? [],
      components: {
        securitySchemes: options.securitySchemes ?? {},
      },
    },
    hideUntagged: options.hideUntagged ?? true,
    hiddenTag: options.hiddenTag,
    refResolver: {
      buildLocalReference(
        json: { $id?: string },
        _baseUri: string,
        _fragment: string,
        i: number,
      ) {
        return json.$id ?? `def-${i}`;
      },
    },
  });
}

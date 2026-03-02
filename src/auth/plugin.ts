import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import type { Logger } from 'pino';
import type { AuthAdapter } from './adapter.js';

/**
 * Converts Fastify's request headers to a standard Headers object.
 * Handles string arrays by appending multiple values.
 */
export function transformToHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        result.append(key, v);
      }
    } else if (value !== undefined) {
      result.append(key, value);
    }
  }
  return result;
}

/** Options for building the auth plugin. */
export interface AuthPluginOptions<TSession> {
  adapter: AuthAdapter<TSession>;
  logger: Logger;
}

/**
 * Creates a Fastify plugin that:
 * 1. Registers a catch-all route for auth handler (if adapter provides one)
 * 2. Hydrates req.maybeAuthSession on every request via the adapter
 */
export function buildAuthPlugin<TSession>(
  options: AuthPluginOptions<TSession>,
) {
  const { adapter, logger } = options;
  const basePath = adapter.basePath ?? '/auth';
  const skipPaths = new Set(adapter.skipPaths ?? []);

  return fastifyPlugin(async (fastify: FastifyInstance) => {
    // Register auth handler route if adapter provides one
    if (adapter.handler) {
      const handler = adapter.handler;
      const errorRedirectUrl = adapter.errorRedirectUrl;

      fastify.route({
        method: ['GET', 'POST'],
        url: `${basePath}/*`,
        async handler(request: FastifyRequest, reply: FastifyReply) {
          // Handle auth error redirects
          if (errorRedirectUrl && request.url === `${basePath}/error`) {
            const errorParam =
              (request.query as Record<string, string>).error ?? 'unknown';
            return reply.redirect(
              `${errorRedirectUrl}?error=${encodeURIComponent(errorParam)}`,
            );
          }

          const response = await handler(request.raw as unknown as Request);

          // Forward response headers
          for (const [key, value] of response.headers.entries()) {
            reply.header(key, value);
          }

          reply.status(response.status);

          // Forward response body
          if (response.body) {
            const body = await response.text();
            return reply.send(body);
          }

          return reply.send();
        },
      });
    }

    // Register session hydration hook
    fastify.addHook(
      'onRequest',
      async (request: FastifyRequest, _reply: FastifyReply) => {
        // Skip hydration for auth routes and configured skip paths
        if (request.url.startsWith(basePath) || skipPaths.has(request.url)) {
          return;
        }

        try {
          const headers = transformToHeaders(
            request.headers as Record<string, string | string[] | undefined>,
          );
          const session = await adapter.getSession(headers);
          request.maybeAuthSession = session;
        } catch (error) {
          logger.debug({ error, url: request.url }, 'Session hydration failed');
          request.maybeAuthSession = null;
        }
      },
    );
  });
}

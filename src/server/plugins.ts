import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

/** CORS options for the Fastify CORS plugin. */
export interface CorsOptions {
  credentials?: boolean;
  allowedHeaders?: string[];
  maxAge?: number;
  origins?: string[];
  methods?: string[];
}

/** Helmet options (passthrough to @fastify/helmet). */
export interface HelmetOptions {
  enableCSPNonces?: boolean;
  contentSecurityPolicy?:
    | boolean
    | {
        directives?: Record<string, string[]>;
      };
}

/** Cookie options (passthrough to @fastify/cookie). */
export interface CookieOptions {
  secret?: string;
}

/** Compress options (passthrough to @fastify/compress). */
export interface CompressOptions {
  global?: boolean;
}

/** Multipart options (passthrough to @fastify/multipart). */
export interface MultipartOptions {
  limits?: {
    fieldNameSize?: number;
    fieldSize?: number;
    fields?: number;
    fileSize?: number;
    files?: number;
  };
}

/** WebSocket options (passthrough to @fastify/websocket). */
export interface WebsocketOptions {
  options?: Record<string, unknown>;
}

/** Autoload options for route auto-discovery. */
export interface AutoloadOptions {
  dir?: string;
  routeParams?: boolean;
  autoHooks?: boolean;
  cascadeHooks?: boolean;
}

/** Configuration for all optional Fastify plugins. */
export interface PluginOptions {
  cors?: CorsOptions | boolean;
  helmet?: HelmetOptions | boolean;
  cookie?: CookieOptions | boolean;
  compress?: CompressOptions | boolean;
  multipart?: MultipartOptions | boolean;
  websocket?: WebsocketOptions | boolean;
  sse?: boolean;
  autoload?: AutoloadOptions | false;
}

/**
 * Converts origin strings to regex patterns for CORS matching.
 * Escapes dots in domain names to prevent regex injection.
 */
function buildCorsOrigins(origins: string[]): RegExp[] {
  return origins.map(
    (origin) => new RegExp(`${origin.replace(/\./g, '\\.')}$`, 'i'),
  );
}

/**
 * Attempts a dynamic import of an optional peer dependency.
 * Returns null if the module is not installed.
 */
// biome-ignore lint/suspicious/noExplicitAny: peer deps have varying types
async function tryImport(moduleName: string): Promise<any | null> {
  try {
    return await import(/* webpackIgnore: true */ moduleName);
  } catch {
    return null;
  }
}

/**
 * Registers Fastify plugins in the correct order.
 * Plugins whose peer dep is not installed are silently skipped
 * unless explicitly enabled (truthy value in options).
 *
 * @param server FastifyInstance
 * @param pluginOptions PluginOptions
 * @param options Object with logger, baseDir, and skipAutoload properties
 */
export async function registerPlugins(
  server: FastifyInstance,
  pluginOptions: PluginOptions,
  options: {
    logger: Logger;
    baseDir: string;
    skipAutoload?: boolean;
  },
) {
  const { logger, baseDir } = options;

  // 1. SSE
  if (pluginOptions.sse !== false) {
    const mod = await tryImport('fastify-sse-v2');
    if (mod) {
      await server.register(mod.FastifySSEPlugin);
    }
  }

  // 2. Cookie
  if (pluginOptions.cookie !== false) {
    const mod = await tryImport('@fastify/cookie');
    if (mod) {
      const opts =
        typeof pluginOptions.cookie === 'object' ? pluginOptions.cookie : {};
      await server.register(mod.default, opts);
    }
  }

  // 3. WebSocket
  if (pluginOptions.websocket !== false) {
    const mod = await tryImport('@fastify/websocket');
    if (mod) {
      const opts =
        typeof pluginOptions.websocket === 'object'
          ? pluginOptions.websocket
          : {};
      await server.register(mod.default, opts);
    }
  }

  // 4. Compress
  if (pluginOptions.compress !== false) {
    const mod = await tryImport('@fastify/compress');
    if (mod) {
      const opts =
        typeof pluginOptions.compress === 'object'
          ? pluginOptions.compress
          : {};
      await server.register(mod.default, opts);
    }
  }

  // 5. CORS
  if (pluginOptions.cors !== false) {
    const mod = await tryImport('@fastify/cors');
    if (mod) {
      const corsConfig =
        typeof pluginOptions.cors === 'object' ? pluginOptions.cors : {};
      // biome-ignore lint/suspicious/noExplicitAny: cors options vary by version
      const corsOpts: Record<string, any> = {
        credentials: corsConfig.credentials ?? true,
        allowedHeaders: corsConfig.allowedHeaders ?? [
          'authorization',
          'content-type',
          'x-locale',
          'origin',
          'pragma',
          'cache-control',
          'accept',
          'keep-alive',
          'if-modified-since',
          'x-requested-with',
          'dnt',
        ],
        maxAge: corsConfig.maxAge ?? 86400,
        methods: corsConfig.methods ?? [
          'GET',
          'POST',
          'PUT',
          'PATCH',
          'DELETE',
          'OPTIONS',
        ],
      };

      // Only set origin if explicitly configured; omit to use plugin defaults
      if (corsConfig.origins) {
        corsOpts.origin = buildCorsOrigins(corsConfig.origins);
      }

      await server.register(mod.default, corsOpts);
    }
  }

  // 6. Helmet
  if (pluginOptions.helmet !== false) {
    const mod = await tryImport('@fastify/helmet');
    if (mod) {
      const opts =
        typeof pluginOptions.helmet === 'object' ? pluginOptions.helmet : {};
      await server.register(mod.default, {
        enableCSPNonces: false,
        ...opts,
        contentSecurityPolicy: {
          ...(typeof opts.contentSecurityPolicy === 'object' ? opts : {}),
          directives: {
            ...(typeof opts.contentSecurityPolicy === 'object'
              ? opts.contentSecurityPolicy.directives
              : {}),
            'script-src': [
              ...(typeof opts.contentSecurityPolicy === 'object' &&
              opts.contentSecurityPolicy.directives
                ? opts.contentSecurityPolicy.directives['script-src'] || []
                : []),
              "'self'",
              'https://cdn.jsdelivr.net/npm/@scalar/api-reference',
            ],
          },
        },
      });
    }
  }

  // 7. Multipart (registered after auth in the flow, but before schemas)
  if (pluginOptions.multipart !== false) {
    const mod = await tryImport('@fastify/multipart');
    if (mod) {
      const opts =
        typeof pluginOptions.multipart === 'object'
          ? pluginOptions.multipart
          : {};
      await server.register(mod.default, {
        limits: {
          fieldNameSize: 100,
          fieldSize: 100,
          fields: 10,
          fileSize: 10 * 1024 * 1024,
          files: 1,
          ...((opts as MultipartOptions).limits ?? {}),
        },
      });
    }
  }

  // 8. Autoload (registered last, after all plugins and schemas)
  if (!options.skipAutoload && pluginOptions.autoload !== false) {
    const mod = await tryImport('@fastify/autoload');
    if (mod) {
      const autoloadConfig =
        typeof pluginOptions.autoload === 'object'
          ? pluginOptions.autoload
          : {};
      const routesDir =
        autoloadConfig.dir ?? path.join(baseDir, 'src', 'routes');
      logger.debug({ routesDir }, 'autoloading routes');
      await server.register(mod.default, {
        dir: routesDir,
        routeParams: autoloadConfig.routeParams ?? true,
        autoHooks: autoloadConfig.autoHooks ?? true,
        cascadeHooks: autoloadConfig.cascadeHooks ?? true,
      });
    }
  }
}

/**
 * Registers @fastify/autoload separately from other plugins.
 * Used when autoload must run after swagger registration so that
 * routes are discovered by the swagger onRoute hook.
 */
export async function registerAutoload(
  server: FastifyInstance,
  pluginOptions: PluginOptions,
  options: { logger: Logger; baseDir: string },
) {
  if (pluginOptions.autoload === false) return;

  const mod = await tryImport('@fastify/autoload');
  if (mod) {
    const autoloadConfig =
      typeof pluginOptions.autoload === 'object' ? pluginOptions.autoload : {};
    const routesDir =
      autoloadConfig.dir ?? path.join(options.baseDir, 'src', 'routes');

    if (!fs.existsSync(routesDir)) {
      throw new Error(
        `Routes directory not found: ${routesDir}. Create the directory or set autoload.dir in withPlugins().`,
      );
    }

    options.logger.debug({ routesDir }, 'autoloading routes');
    await server.register(mod.default, {
      dir: routesDir,
      routeParams: autoloadConfig.routeParams ?? true,
      autoHooks: autoloadConfig.autoHooks ?? true,
      cascadeHooks: autoloadConfig.cascadeHooks ?? true,
    });
  }
}

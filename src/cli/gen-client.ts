import type { Command } from 'commander';
import type { TelaioApp } from '../types.js';
import { discoverAppModule } from './discover.js';
import { loadCliMetadata } from './resolve-config.js';

/** Default hey-api plugins for client generation. */
const DEFAULT_PLUGINS = [
  '@tanstack/react-query',
  { name: '@hey-api/typescript' },
  { name: '@hey-api/schemas', type: 'json' },
];

/**
 * Resolves a TelaioApp from the given module path.
 * Tries builder functions first (buildFastifyApp, buildApp, build, default),
 * then falls back to pre-built app/default exports.
 */
export async function resolveTelaioApp(
  appModulePath: string,
  cwd: string,
): Promise<TelaioApp> {
  const mod = await import(new URL(appModulePath, `file://${cwd}/`).href);

  // Try builder functions in priority order (pass true for ephemeral)
  const builderNames = ['buildFastifyApp', 'buildApp', 'build'];
  for (const name of builderNames) {
    if (typeof mod[name] === 'function') {
      const result = await mod[name](true);
      if (result?.fastify) return result;
    }
  }

  // Try default export as a builder function
  if (typeof mod.default === 'function') {
    const result = await mod.default(true);
    if (result?.fastify) return result;
  }

  // Fall back to pre-built app exports
  const preBuilt = mod.app ?? mod.default;
  if (preBuilt?.fastify) return preBuilt;

  throw new Error(
    `telaio: gen-client could not find a TelaioApp at '${appModulePath}'. ` +
      'The module must export a builder function (buildFastifyApp, buildApp, build) ' +
      'or a pre-built { app } with a .fastify instance.',
  );
}

/** Registers the `telaio gen-client` command. */
export function registerGenClientCommand(program: Command): void {
  program
    .command('gen-client')
    .description('Generate a typed OpenAPI client from the app swagger spec')
    .option(
      '-a, --app <path>',
      'Path to the app module (builder function or pre-built TelaioApp)',
    )
    .option('-o, --output <directory>', 'Output directory for generated client')
    .option('--plugins <plugins>', 'Comma-separated list of hey-api plugins')
    .action(
      async (options: { app?: string; output?: string; plugins?: string }) => {
        const cwd = process.cwd();
        const metadata = await loadCliMetadata(cwd);

        // Resolve app module path: CLI flag > metadata > auto-discover
        const appPath = options.app ?? discoverAppModule(cwd, metadata);
        if (!appPath) {
          throw new Error(
            'telaio: gen-client requires an app module. Set app in defineConfig() or pass --app.',
          );
        }

        const output = options.output ?? metadata.client?.output ?? 'client';

        // Resolve plugins: CLI flag > config > default
        let plugins: (string | Record<string, unknown>)[];
        if (options.plugins) {
          plugins = options.plugins.split(',').map((p: string) => {
            const trimmed = p.trim();
            if (trimmed.startsWith('{')) return JSON.parse(trimmed);
            return trimmed;
          });
        } else if (metadata.client?.plugins) {
          plugins = metadata.client.plugins;
        } else {
          plugins = DEFAULT_PLUGINS;
        }

        // biome-ignore lint/suspicious/noExplicitAny: hey-api createClient has complex overloaded types
        let createClient: (...args: any[]) => Promise<unknown>;
        try {
          const mod = await import('@hey-api/openapi-ts');
          createClient = mod.createClient;
        } catch {
          throw new Error(
            "telaio: gen-client requires '@hey-api/openapi-ts' to be installed. Run: pnpm add -D @hey-api/openapi-ts",
          );
        }

        // Resolve the TelaioApp via builder discovery
        const app = await resolveTelaioApp(appPath, cwd);
        await app.fastify.ready();

        // Extract swagger spec (swagger() comes from @fastify/swagger augmentation)
        const fastify = app.fastify as import('fastify').FastifyInstance & {
          swagger?: () => Record<string, unknown>;
        };
        const swagger = fastify.swagger?.();
        if (!swagger) {
          throw new Error(
            'telaio: gen-client requires @fastify/swagger to be registered. ' +
              'Call .withSwagger() on the builder.',
          );
        }

        console.log(`Generating client to ${output}...`);

        await createClient({
          input: swagger,
          output: {
            path: output,
            importFileExtension: '.js',
            postProcess: ['biome:lint', 'biome:format'],
          },
          plugins,
        });

        await app.fastify.close();
        console.log('Client generated successfully.');
        process.exit(0);
      },
    );
}

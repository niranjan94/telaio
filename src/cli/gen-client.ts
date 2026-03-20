import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Command } from 'commander';
import type { TelaioApi } from '../types.js';
import { discoverAppModule, loadCliMetadata } from './resolve-config.js';

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
): Promise<TelaioApi> {
  const mod = await import(new URL(appModulePath, `file://${cwd}/`).href);

  // Try builder functions in priority order (pass true for ephemeral)
  const builderNames = ['buildApi', 'buildFastifyApp', 'buildApp'];
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
    `telaio: gen-client could not find a TelaioApi at '${appModulePath}'. ` +
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
    .option('--watch', 'Watch src/ for changes and regenerate')
    .action(
      async (options: {
        app?: string;
        output?: string;
        plugins?: string;
        watch?: boolean;
      }) => {
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

        const generate = async () => {
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
        };

        if (options.watch) {
          let watcher: typeof import('@parcel/watcher');
          try {
            const mod = await import('@parcel/watcher');
            watcher = mod.default ?? mod;
          } catch {
            throw new Error(
              "telaio: --watch requires '@parcel/watcher'. Install it: pnpm add -D @parcel/watcher",
            );
          }

          // Build args for the child process (same command, minus --watch)
          const childArgs = ['gen-client'];
          if (options.app) childArgs.push('--app', options.app);
          if (options.output) childArgs.push('--output', options.output);
          if (options.plugins) childArgs.push('--plugins', options.plugins);

          const spawnGenClient = () =>
            new Promise<void>((resolve) => {
              const child = spawn(
                process.execPath,
                [process.argv[1], ...childArgs],
                {
                  stdio: 'inherit',
                  cwd,
                },
              );
              child.on('close', () => resolve());
            });

          // Initial generation in a child process
          await spawnGenClient();

          console.log('Watching src/ for changes...');
          let debounce: ReturnType<typeof setTimeout> | null = null;

          await watcher.subscribe(
            cwd,
            (_err, events) => {
              if (!events?.length) return;
              const relevant = events.some((e) => {
                const rel = path.relative(cwd, e.path);
                return rel.startsWith(`src${path.sep}`) || rel === 'src';
              });
              if (!relevant) return;

              if (debounce) clearTimeout(debounce);
              debounce = setTimeout(async () => {
                console.log('Changes detected, regenerating client...');
                await spawnGenClient();
              }, 300);
            },
            { ignore: ['node_modules', '.git', 'dist', 'client'] },
          );

          // Keep alive -- wait for signal
          await new Promise(() => {});
        } else {
          await generate();
          process.exit(0);
        }
      },
    );
}

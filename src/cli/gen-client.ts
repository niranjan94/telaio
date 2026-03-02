import type { Command } from 'commander';
import { readTelaioConfig } from './config.js';

/** Registers the `telaio gen-client` command. */
export function registerGenClientCommand(program: Command): void {
  program
    .command('gen-client')
    .description('Generate a typed OpenAPI client from the app swagger spec')
    .option(
      '-a, --app <path>',
      'Path to the app module (must export { app } with a .fastify instance)',
    )
    .option('-o, --output <directory>', 'Output directory for generated client')
    .option('--plugins <plugins>', 'Comma-separated list of hey-api plugins')
    .action(
      async (options: { app?: string; output?: string; plugins?: string }) => {
        const config = readTelaioConfig(process.cwd());

        const appPath = options.app ?? config.app;
        if (!appPath) {
          throw new Error(
            'telaio: gen-client requires an app path. Set telaio.app in package.json or pass --app.',
          );
        }

        const output = options.output ?? config.client?.output ?? 'client';

        // Resolve plugins: CLI flag > config > default
        let plugins: (string | Record<string, unknown>)[];
        if (options.plugins) {
          plugins = options.plugins.split(',').map((p: string) => {
            const trimmed = p.trim();
            if (trimmed.startsWith('{')) return JSON.parse(trimmed);
            return trimmed;
          });
        } else if (config.client?.plugins) {
          plugins = config.client.plugins;
        } else {
          plugins = [
            '@tanstack/react-query',
            '@hey-api/typescript',
            '@hey-api/schemas',
          ];
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

        // Dynamically import the user's app module
        const appModule = await import(
          new URL(appPath, `file://${process.cwd()}/`).href
        );
        const app = appModule.app ?? appModule.default;

        if (!app?.fastify) {
          throw new Error(
            `telaio: gen-client could not find a TelaioApp export at '${appPath}'. ` +
              'The module must export { app } with a .fastify instance.',
          );
        }

        await app.fastify.ready();

        // Extract swagger spec
        const swagger = app.fastify.swagger?.();
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
      },
    );
}

import type { Command } from 'commander';

/** Registers the `telaio gen-client` command. */
export function registerGenClientCommand(program: Command): void {
  program
    .command('gen-client')
    .description('Generate a typed OpenAPI client from the app swagger spec')
    .requiredOption(
      '-a, --app <path>',
      'Path to the app module (must export { app } with a .fastify instance)',
    )
    .option(
      '-o, --output <directory>',
      'Output directory for generated client',
      'client',
    )
    .option(
      '--plugins <plugins>',
      'Comma-separated list of hey-api plugins',
      '@tanstack/react-query,@hey-api/typescript,@hey-api/schemas',
    )
    .action(
      async (options: { app: string; output: string; plugins: string }) => {
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
          new URL(options.app, `file://${process.cwd()}/`).href
        );
        const app = appModule.app ?? appModule.default;

        if (!app?.fastify) {
          throw new Error(
            `telaio: gen-client could not find a TelaioApp export at '${options.app}'. ` +
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

        // Parse plugins
        const plugins = options.plugins.split(',').map((p: string) => {
          const trimmed = p.trim();
          // Simple string plugins are passed as-is; object-style plugins need
          // special handling which users can do in a custom script
          if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed);
          }
          return trimmed;
        });

        console.log(`Generating client to ${options.output}...`);

        await createClient({
          input: swagger,
          output: {
            path: options.output,
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

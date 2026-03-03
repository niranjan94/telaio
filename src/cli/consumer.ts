import type { Command } from 'commander';
import { discoverConsumerRegistry } from './discover.js';
import { loadCliMetadata, resolveCliConfig } from './resolve-config.js';

/** Registers the `telaio consumer` CLI command. */
export function registerConsumerCommand(program: Command): void {
  program
    .command('consumer')
    .description('Start the queue consumer process')
    .option(
      '-r, --registry <path>',
      'Path to queue registry module (exports { queues })',
    )
    .action(async (options: { registry?: string }) => {
      const cwd = process.cwd();
      const appConfig = await resolveCliConfig(cwd);
      const metadata = await loadCliMetadata(cwd);

      // Resolve registry: CLI flag > auto-discover (metadata + convention)
      const registryPath =
        options.registry ?? discoverConsumerRegistry(cwd, metadata);

      if (!registryPath) {
        throw new Error(
          'telaio: consumer requires a registry path. Set consumer.registry in defineConfig() or pass --registry.',
        );
      }

      const databaseUrl = appConfig.DATABASE_URL as string | undefined;
      if (!databaseUrl) {
        throw new Error(
          'telaio: DATABASE_URL is required for the consumer. ' +
            'Set it in your .env or telaio.config.ts.',
        );
      }

      // Dynamic import of the registry module
      const mod = await import(new URL(registryPath, `file://${cwd}/`).href);
      const queues = mod.queues ?? mod.default;

      if (!queues || typeof queues !== 'object') {
        throw new Error(
          `telaio: consumer could not find a queue registry at '${registryPath}'. ` +
            'The module must export { queues } or a default queue registry.',
        );
      }

      // Import startConsumer from the queue module
      const { startConsumer } = await import('../queue/consumer.js');
      const { createLogger } = await import('../logger/index.js');

      const nodeEnv = (appConfig.NODE_ENV as string) ?? process.env.NODE_ENV;
      const logger = createLogger({
        pretty: nodeEnv !== 'production',
      });

      await startConsumer(queues, {
        connection: { connectionString: databaseUrl },
        logger,
      });
    });
}

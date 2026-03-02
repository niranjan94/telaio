import type { Command } from 'commander';
import { readTelaioConfig } from './config.js';

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
      const config = readTelaioConfig(process.cwd());
      const registryPath = options.registry ?? config.consumer?.registry;

      if (!registryPath) {
        throw new Error(
          'telaio: consumer requires a registry path. Set telaio.consumer.registry in package.json or pass --registry.',
        );
      }

      // Dynamic import of the registry module
      const mod = await import(
        new URL(registryPath, `file://${process.cwd()}/`).href
      );
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

      const logger = createLogger({
        pretty: process.env.NODE_ENV !== 'production',
      });

      await startConsumer(queues, {
        connection: { connectionString: process.env.DATABASE_URL },
        logger,
      });
    });
}

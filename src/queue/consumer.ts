import type { Logger } from 'pino';
import { getBoss, type QueueClientOptions, stopBoss } from './client.js';
import type { QueueRegistry } from './producer.js';

/** Options for the consumer runner. */
export interface ConsumerOptions {
  /** pg-boss connection options or config object. */
  connection: QueueClientOptions | Record<string, unknown>;
  /** Logger instance. */
  logger?: Logger;
}

/**
 * Starts consuming all queues in the registry. Creates each queue if it
 * doesn't exist, then registers a pg-boss worker for each.
 *
 * This is intended to be called in a separate consumer process entry point.
 * It sets up SIGINT/SIGTERM handlers for graceful shutdown.
 */
export async function startConsumer<TRegistry extends QueueRegistry>(
  registry: TRegistry,
  options: ConsumerOptions,
): Promise<void> {
  const { connection, logger } = options;
  const queueLogger = logger?.child({ module: 'consumer' });

  const boss = await getBoss(connection, logger);
  const queueNames = Object.keys(registry);

  if (queueNames.length === 0) {
    queueLogger?.error('No queues found to consume. Shutting down.');
    await stopBoss(logger);
    return;
  }

  for (const queueName of queueNames) {
    const handler = registry[queueName];

    await boss.createQueue(queueName);

    await boss.work(queueName, async (jobs: unknown[]) => {
      queueLogger?.info(
        {
          queue: queueName,
          count: jobs.length,
          ids: jobs.map((j) => (j as Record<string, unknown>).id as string),
        },
        'received jobs',
      );
      await handler(jobs as Parameters<typeof handler>[0]);
    });

    queueLogger?.info(`Consuming ${queueName} queue...`);
  }

  // Idempotent graceful shutdown on SIGINT/SIGTERM
  let shuttingDown = false;
  const requestShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    queueLogger?.info('Shutting down consumer...');
    await stopBoss(logger);
  };

  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
}

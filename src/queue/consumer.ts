import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import type { QueueRegistry } from './producer.js';

/**
 * Registers pg-boss workers for all queues in the registry.
 * Internal helper used by buildConsumer().
 */
export async function registerQueueWorkers<TRegistry extends QueueRegistry>(
  boss: PgBoss,
  registry: TRegistry,
  logger?: Logger,
): Promise<void> {
  const queueLogger = logger?.child({ module: 'consumer' });
  const queueNames = Object.keys(registry);

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
}

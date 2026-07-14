import type { PgBoss, WorkOptions } from 'pg-boss';
import type { Logger } from 'pino';
import type { QueueRegistry } from './producer.js';

/**
 * Per-queue pg-boss work options, keyed by queue name. Lets a consumer tune
 * concurrency (e.g. `localConcurrency`), batch size, or polling for individual
 * queues. Queues absent from this map fall back to pg-boss defaults (a single
 * worker fetching one job at a time).
 */
export type QueueWorkOptions = Partial<Record<string, WorkOptions>>;

/**
 * Registers pg-boss workers for all queues in the registry.
 * Internal helper used by buildConsumer().
 *
 * When `workOptions` has an entry for a queue, it is forwarded to
 * `boss.work()`, letting callers control that queue's concurrency and fetching
 * independently of the others.
 */
export async function registerQueueWorkers<TRegistry extends QueueRegistry>(
  boss: PgBoss,
  registry: TRegistry,
  logger?: Logger,
  workOptions?: QueueWorkOptions,
): Promise<void> {
  const queueLogger = logger?.child({ module: 'consumer' });
  const queueNames = Object.keys(registry);

  for (const queueName of queueNames) {
    const handler = registry[queueName];
    await boss.createQueue(queueName);

    const onJobs = async (jobs: unknown[]) => {
      queueLogger?.info(
        {
          queue: queueName,
          count: jobs.length,
          ids: jobs.map((j) => (j as Record<string, unknown>).id as string),
        },
        'received jobs',
      );
      await handler(jobs as Parameters<typeof handler>[0]);
    };

    const options = workOptions?.[queueName];
    if (options) {
      await boss.work(queueName, options, onJobs);
    } else {
      await boss.work(queueName, onJobs);
    }

    queueLogger?.info(`Consuming ${queueName} queue...`);
  }
}

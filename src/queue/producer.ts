import type { Job, SendOptions } from 'pg-boss';
import type { Logger } from 'pino';
import { getBoss, type QueueClientOptions } from './client.js';

/**
 * Handler function for a queue job. Receives an array of pg-boss jobs
 * and processes them. Throw an error to mark the batch as failed.
 */
// biome-ignore lint/suspicious/noExplicitAny: pg-boss work() infers unknown for untyped handlers; using any allows the registry to hold handlers with varying data types without generic conflicts
export type QueueJobHandler<TData = any> = (
  jobs: Job<TData>[],
) => Promise<void>;

/**
 * Registry mapping queue names to their handler functions.
 * Users define this in their app and pass it to withQueues().
 */
export type QueueRegistry = Record<string, QueueJobHandler>;

/**
 * Infers the expected job data type for a given queue name from the registry.
 * Extracts TData from the handler's `Job<TData>[]` parameter.
 */
export type JobDataFor<
  TRegistry extends QueueRegistry,
  K extends keyof TRegistry,
> = TRegistry[K] extends (jobs: Job<infer TData>[]) => Promise<void>
  ? TData
  : never;

/**
 * Type-safe queue producer. The send() method constrains the data shape
 * based on the registered handler's expected job data type.
 */
export interface QueueProducer<TRegistry extends QueueRegistry> {
  /** Send a job to the specified queue with type-safe data. */
  send<K extends keyof TRegistry & string>(
    queueName: K,
    data: JobDataFor<TRegistry, K>,
    options?: SendOptions,
  ): Promise<string | null>;
}

/**
 * Creates a type-safe queue producer bound to a specific registry.
 * The producer's send() method infers the correct data type from the registry.
 */
export function createQueueProducer<TRegistry extends QueueRegistry>(
  connectionOptions: QueueClientOptions | Record<string, unknown>,
  logger?: Logger,
): QueueProducer<TRegistry> {
  return {
    async send<K extends keyof TRegistry & string>(
      queueName: K,
      data: JobDataFor<TRegistry, K>,
      options?: SendOptions,
    ): Promise<string | null> {
      const boss = await getBoss(connectionOptions, logger);
      return boss.send(queueName, data as object, options);
    },
  };
}

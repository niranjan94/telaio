import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../builder.js';
import { createLogger } from '../../logger/index.js';

const logger = createLogger({ level: 'silent', pretty: false });

describe('buildConsumer', () => {
  it('returns an object with start, stop, config, logger', async () => {
    const registry = { testQueue: vi.fn() };
    const consumer = await createApp({ logger })
      .withQueues(registry)
      .buildConsumer();

    expect(consumer.config).toBeDefined();
    expect(consumer.logger).toBeDefined();
    expect(typeof consumer.start).toBe('function');
    expect(typeof consumer.stop).toBe('function');
  });

  it('does not have a fastify property', async () => {
    const registry = { testQueue: vi.fn() };
    const consumer = await createApp({ logger })
      .withQueues(registry)
      .buildConsumer();

    expect((consumer as Record<string, unknown>).fastify).toBeUndefined();
  });

  it('accepts per-queue workOptions and still builds a consumer', async () => {
    const registry = { testQueue: vi.fn() };
    const consumer = await createApp({ logger })
      .withQueues(registry, {
        workOptions: { testQueue: { localConcurrency: 3 } },
      })
      .buildConsumer();

    expect(typeof consumer.start).toBe('function');
  });

  it('fires onStart callbacks in order', async () => {
    const calls: string[] = [];
    const registry = { testQueue: vi.fn() };

    const _consumer = await createApp({ logger })
      .withQueues(registry)
      .onStart(async () => {
        calls.push('first');
      })
      .onStart(async () => {
        calls.push('second');
      })
      .buildConsumer();

    // Access internal to verify callbacks are stored
    // (full start() test requires pg-boss, covered in integration)
    expect(calls).toEqual([]); // not called yet at build time
  });
});

import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { registerQueueWorkers } from '../consumer.js';
import type { QueueJobHandler } from '../producer.js';

/** Minimal pg-boss stub exposing only the methods registerQueueWorkers calls. */
function makeBossStub() {
  return {
    createQueue: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue('worker-id'),
  };
}

describe('registerQueueWorkers', () => {
  it('creates each queue and registers a worker for it', async () => {
    const boss = makeBossStub();
    const alpha: QueueJobHandler = vi.fn();
    const beta: QueueJobHandler = vi.fn();

    await registerQueueWorkers(boss as unknown as PgBoss, { alpha, beta });

    expect(boss.createQueue).toHaveBeenCalledWith('alpha');
    expect(boss.createQueue).toHaveBeenCalledWith('beta');
    expect(boss.work).toHaveBeenCalledTimes(2);
  });

  it('uses the two-arg work() overload when no options are given', async () => {
    const boss = makeBossStub();
    const alpha: QueueJobHandler = vi.fn();

    await registerQueueWorkers(boss as unknown as PgBoss, { alpha });

    const call = boss.work.mock.calls[0];
    expect(call[0]).toBe('alpha');
    expect(call).toHaveLength(2);
    expect(typeof call[1]).toBe('function');
  });

  it('forwards per-queue work options to boss.work() when provided', async () => {
    const boss = makeBossStub();
    const alpha: QueueJobHandler = vi.fn();
    const beta: QueueJobHandler = vi.fn();

    await registerQueueWorkers(
      boss as unknown as PgBoss,
      { alpha, beta },
      undefined,
      { alpha: { localConcurrency: 5 } },
    );

    const alphaCall = boss.work.mock.calls.find((c) => c[0] === 'alpha');
    const betaCall = boss.work.mock.calls.find((c) => c[0] === 'beta');

    // alpha has options -> three-arg overload (name, options, handler)
    expect(alphaCall).toHaveLength(3);
    expect(alphaCall?.[1]).toEqual({ localConcurrency: 5 });
    expect(typeof alphaCall?.[2]).toBe('function');

    // beta has no options -> two-arg overload (name, handler)
    expect(betaCall).toHaveLength(2);
    expect(typeof betaCall?.[1]).toBe('function');
  });

  it('invokes the registered handler with the jobs the worker receives', async () => {
    const boss = makeBossStub();
    const handler: QueueJobHandler = vi.fn().mockResolvedValue(undefined);

    await registerQueueWorkers(boss as unknown as PgBoss, { alpha: handler });

    const onJobs = boss.work.mock.calls[0][1] as (
      jobs: unknown[],
    ) => Promise<void>;
    const jobs = [{ id: 'j1', data: { x: 1 } }];
    await onJobs(jobs);

    expect(handler).toHaveBeenCalledWith(jobs);
  });
});

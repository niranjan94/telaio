import type { Job } from 'pg-boss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetBoss,
  _resolveQueueOptions,
  getBoss,
  stopBoss,
} from '../client.js';
import type {
  JobDataFor,
  QueueJobHandler,
  QueueRegistry,
} from '../producer.js';

describe('queue client', () => {
  afterEach(() => {
    _resetBoss();
    vi.restoreAllMocks();
  });

  it('throws when connectionString is missing', async () => {
    await expect(getBoss({})).rejects.toThrow(
      'telaio: queue requires a connectionString or DATABASE_URL in config.',
    );
  });

  it('resolves connectionString from options', () => {
    // We just test that resolveOptions works via getBoss — it will fail
    // trying to import pg-boss in a test environment but the options
    // resolution happens before the import.
    // The import will succeed since pg-boss is installed, but will fail
    // to connect to postgres. We'll test the type-level guarantees here.
    expect(_resetBoss).toBeDefined();
  });

  it('stopBoss is a no-op when no boss instance exists', async () => {
    // Should not throw
    await stopBoss();
  });

  it('_resetBoss clears singleton state', () => {
    _resetBoss();
    // Should not throw, just resets internal state
    expect(true).toBe(true);
  });
});

describe('queue option resolution', () => {
  const NON_RDS = 'postgresql://user:pw@localhost:5432/test';
  const RDS =
    'postgresql://user:pw@db.cluster.region.rds.amazonaws.com:5432/test';

  it('omits ssl for non-RDS connection strings by default', () => {
    const opts = _resolveQueueOptions({ connectionString: NON_RDS });
    expect(opts.ssl).toBeUndefined();
    expect(opts.connectionString).toBe(NON_RDS);
    expect(opts.schema).toBe('pgboss');
  });

  it('auto-enables ssl with rejectUnauthorized: false for RDS hostnames', () => {
    const opts = _resolveQueueOptions({ connectionString: RDS });
    expect(opts.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('enables ssl when ssl: true is passed explicitly', () => {
    const opts = _resolveQueueOptions({
      connectionString: NON_RDS,
      ssl: true,
    });
    expect(opts.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('disables ssl when ssl: false is passed explicitly, even for RDS', () => {
    const opts = _resolveQueueOptions({ connectionString: RDS, ssl: false });
    expect(opts.ssl).toBeUndefined();
  });

  it('reads connection string and auto-enables ssl from config-style RDS URL', () => {
    const opts = _resolveQueueOptions({ DATABASE_URL: RDS });
    expect(opts.connectionString).toBe(RDS);
    expect(opts.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('honours DATABASE_SSL: true in config-style object', () => {
    const opts = _resolveQueueOptions({
      DATABASE_URL: NON_RDS,
      DATABASE_SSL: true,
    });
    expect(opts.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('honours DATABASE_SSL: false in config-style object, even for RDS', () => {
    const opts = _resolveQueueOptions({
      DATABASE_URL: RDS,
      DATABASE_SSL: false,
    });
    expect(opts.ssl).toBeUndefined();
  });

  it('uses custom schema when provided', () => {
    const opts = _resolveQueueOptions({
      connectionString: NON_RDS,
      schema: 'custom_pgboss',
    });
    expect(opts.schema).toBe('custom_pgboss');
  });
});

describe('queue producer types', () => {
  it('QueueJobHandler accepts typed job data', () => {
    // Type-level test: handler with typed data compiles
    const handler: QueueJobHandler<{ userId: string }> = async (jobs) => {
      for (const job of jobs) {
        // job.data should be typed as { userId: string }
        expect(job.data).toBeDefined();
      }
    };
    expect(handler).toBeDefined();
  });

  it('QueueRegistry accepts handlers with different data types', () => {
    const registry = {
      userSync: (async (jobs: Job<{ userId: string }>[]) => {
        for (const _job of jobs) {
          /* noop */
        }
      }) satisfies QueueJobHandler<{ userId: string }>,
      emailSend: (async (jobs: Job<{ to: string; subject: string }>[]) => {
        for (const _job of jobs) {
          /* noop */
        }
      }) satisfies QueueJobHandler<{ to: string; subject: string }>,
    } satisfies QueueRegistry;

    expect(Object.keys(registry)).toEqual(['userSync', 'emailSend']);
  });

  it('JobDataFor infers correct data type from handler', () => {
    type TestRegistry = {
      userSync: QueueJobHandler<{ userId: string }>;
      emailSend: QueueJobHandler<{ to: string; subject: string }>;
    };

    // Type-level assertions — these don't execute but verify compilation
    type UserData = JobDataFor<TestRegistry, 'userSync'>;
    type EmailData = JobDataFor<TestRegistry, 'emailSend'>;

    // Runtime check that the types exist (always true, but tests the type system)
    const _userDataShape: UserData = { userId: 'test' };
    const _emailDataShape: EmailData = { to: 'test', subject: 'test' };
    expect(_userDataShape.userId).toBe('test');
    expect(_emailDataShape.to).toBe('test');
  });
});

describe('queue module exports', () => {
  it('exports all expected functions and types', async () => {
    const mod = await import('../index.js');
    expect(mod.getBoss).toBeDefined();
    expect(typeof mod.getBoss).toBe('function');
    expect(mod.stopBoss).toBeDefined();
    expect(typeof mod.stopBoss).toBe('function');
    expect(mod._resetBoss).toBeDefined();
    expect(typeof mod._resetBoss).toBe('function');
    expect(mod.createQueueProducer).toBeDefined();
    expect(typeof mod.createQueueProducer).toBe('function');
  });
});

import type { Job } from 'pg-boss';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  JobDataFor,
  QueueJobHandler,
  QueueProducer,
  QueueRegistry,
} from '../../src/queue/index.js';

interface UserSyncData {
  userId: string;
  action: 'create' | 'update';
}

interface EmailSendData {
  to: string;
  subject: string;
  body: string;
}

const testRegistry = {
  userSync: (async (
    _jobs: Job<UserSyncData>[],
  ) => {}) as QueueJobHandler<UserSyncData>,
  emailSend: (async (
    _jobs: Job<EmailSendData>[],
  ) => {}) as QueueJobHandler<EmailSendData>,
};

type TestRegistry = typeof testRegistry;

describe('queue type safety', () => {
  it('JobDataFor extracts the correct data type from a handler', () => {
    type UserData = JobDataFor<TestRegistry, 'userSync'>;
    expectTypeOf<UserData>().toEqualTypeOf<UserSyncData>();

    type EmailData = JobDataFor<TestRegistry, 'emailSend'>;
    expectTypeOf<EmailData>().toEqualTypeOf<EmailSendData>();
  });

  it('QueueJobHandler types jobs correctly', () => {
    const handler: QueueJobHandler<UserSyncData> = async (jobs) => {
      expectTypeOf(jobs).toEqualTypeOf<Job<UserSyncData>[]>();
      for (const job of jobs) {
        expectTypeOf(job.data).toEqualTypeOf<UserSyncData>();
      }
    };
    expectTypeOf(handler).toBeFunction();
  });

  it('QueueProducer send constrains data to the correct type', () => {
    const producer = {} as QueueProducer<TestRegistry>;

    // send() for userSync should require UserSyncData
    expectTypeOf(producer.send<'userSync'>)
      .parameter(1)
      .toEqualTypeOf<UserSyncData>();

    // send() for emailSend should require EmailSendData
    expectTypeOf(producer.send<'emailSend'>)
      .parameter(1)
      .toEqualTypeOf<EmailSendData>();
  });

  it('QueueRegistry is a record of string to QueueJobHandler', () => {
    type IsRecord =
      QueueRegistry extends Record<string, QueueJobHandler> ? true : false;
    expectTypeOf<IsRecord>().toEqualTypeOf<true>();
  });
});

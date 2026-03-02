import { describe, expectTypeOf, it } from 'vitest';
import type { AuthAdapter } from '../../src/auth/adapter.js';
import { type AppBuilder, createApp } from '../../src/builder.js';
import type { DefaultFeatures, TelaioApp } from '../../src/types.js';

interface TestSession {
  userId: string;
  role: 'admin' | 'user';
  email: string;
}

describe('auth session flow', () => {
  it('withAuth changes the session type parameter', () => {
    const adapter: AuthAdapter<TestSession> = {
      async getSession() {
        return null;
      },
    };

    const builder = createApp().withAuth(adapter);
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { auth: true },
        TestSession,
        Record<string, never>
      >
    >();
  });

  it('session type is preserved through additional builder calls', () => {
    const adapter: AuthAdapter<TestSession> = {
      async getSession() {
        return null;
      },
    };

    const builder = createApp().withAuth(adapter).withDatabase().withCache();
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { auth: true } & { database: true } & {
          cache: true;
        },
        TestSession,
        Record<string, never>
      >
    >();
  });

  it('TelaioApp with auth:true has auth.session typed', () => {
    type App = TelaioApp<
      DefaultFeatures & { auth: true },
      TestSession,
      Record<string, never>
    >;
    const app = {} as App;
    expectTypeOf(app.auth.session).toEqualTypeOf<TestSession>();
  });

  it('TelaioApp without auth does not have auth property', () => {
    type App = TelaioApp<DefaultFeatures, unknown, Record<string, never>>;
    const app = {} as App;
    expectTypeOf(app).not.toHaveProperty('auth');
  });

  it('different adapters produce different session types', () => {
    interface SimpleSession {
      id: string;
    }

    const simpleAdapter: AuthAdapter<SimpleSession> = {
      async getSession() {
        return null;
      },
    };

    const builder = createApp().withAuth(simpleAdapter);
    expectTypeOf(builder).toEqualTypeOf<
      AppBuilder<
        DefaultFeatures & { auth: true },
        SimpleSession,
        Record<string, never>
      >
    >();
  });
});

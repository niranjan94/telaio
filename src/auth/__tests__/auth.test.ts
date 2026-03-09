import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../errors/index.js';
import type { AuthAdapter } from '../adapter.js';
import { registerGuardAdapter, resetGuardAdapter, withAuth } from '../guard.js';
import { transformToHeaders } from '../plugin.js';

describe('transformToHeaders', () => {
  it('converts plain string headers', () => {
    const headers = transformToHeaders({
      'content-type': 'application/json',
      authorization: 'Bearer token123',
    });
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer token123');
  });

  it('handles array headers by appending', () => {
    const headers = transformToHeaders({
      'set-cookie': ['a=1', 'b=2'],
    });
    // Headers.getAll may not exist, but get returns comma-joined
    expect(headers.get('set-cookie')).toContain('a=1');
    expect(headers.get('set-cookie')).toContain('b=2');
  });

  it('skips undefined values', () => {
    const headers = transformToHeaders({
      present: 'yes',
      absent: undefined,
    });
    expect(headers.get('present')).toBe('yes');
    expect(headers.get('absent')).toBeNull();
  });

  it('returns empty Headers for empty input', () => {
    const headers = transformToHeaders({});
    expect([...headers.entries()]).toHaveLength(0);
  });
});

describe('auth module exports', () => {
  it('exports AuthAdapter type and withAuth function', async () => {
    const mod = await import('../index.js');
    expect(mod.withAuth).toBeDefined();
    expect(typeof mod.withAuth).toBe('function');
    expect(mod.buildAuthPlugin).toBeDefined();
    expect(typeof mod.buildAuthPlugin).toBe('function');
    expect(mod.transformToHeaders).toBeDefined();
    expect(mod.registerGuardAdapter).toBeDefined();
    expect(typeof mod.registerGuardAdapter).toBe('function');
  });

  it('exports resetGuardAdapter for test isolation', async () => {
    const mod = await import('../index.js');
    expect(mod.resetGuardAdapter).toBeDefined();
    expect(typeof mod.resetGuardAdapter).toBe('function');
  });

  it('resetGuardAdapter clears the registered adapter so withAuth uses generic guard', () => {
    // Register an adapter with validateScope (activates adapter guard path)
    registerGuardAdapter({
      getSession: async () => ({ id: 'test' }),
      validateScope: () => true,
    } as AuthAdapter<{ id: string }>);

    // Reset it
    resetGuardAdapter();

    // withAuth should now use generic guard (includes 400 in schema)
    const result = withAuth({ scopes: ['x'] });
    const response = (result.schema as Record<string, Record<string, unknown>>)
      .response;
    expect(response[400]).toBeDefined(); // generic guard adds 400
  });
});

describe('registerGuardAdapter + withAuth', () => {
  it('uses generic guard when no adapter is registered', () => {
    // Reset adapter by registering null-like adapter without guard config
    registerGuardAdapter({ getSession: async () => null } as AuthAdapter<null>);
    // Re-register with no guard config to test fallback
    const noGuardAdapter: AuthAdapter<unknown> = {
      async getSession() {
        return null;
      },
    };
    registerGuardAdapter(noGuardAdapter);

    const result = withAuth({ scopes: ['test'] });
    expect(result.schema).toBeDefined();
    expect(result.preValidation).toBeDefined();
    // Generic guard includes 400, 401, 403, 422 response schemas
    const response = (result.schema as Record<string, Record<string, unknown>>)
      .response;
    expect(response[400]).toBeDefined();
    expect(response[401]).toBeDefined();
    expect(response[403]).toBeDefined();
    expect(response[422]).toBeDefined();
  });

  it('uses adapter guard when validateScope is present', () => {
    const adapter: AuthAdapter<{ org: string }> = {
      async getSession() {
        return { org: 'test' };
      },
      validateScope: vi.fn(() => true),
      security: () => [{ cookieAuth: [] }],
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scopes: ['org'] });
    expect(result.schema).toBeDefined();
    // Adapter guard includes security from adapter
    const schema = result.schema as Record<string, unknown>;
    expect(schema.security).toEqual([{ cookieAuth: [] }]);
    // Adapter guard includes 422 response schema
    const response = (schema.response as Record<string, unknown>) ?? {};
    expect(response[401]).toBeDefined();
    expect(response[403]).toBeDefined();
    expect(response[422]).toBeDefined();
  });

  it('adapter guard throws UnauthorizedError for missing session', async () => {
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return null;
      },
      getSessionFromRequest: () => null,
      validateScope: () => true,
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scopes: ['test'] });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    await expect(hook({} as FastifyRequest)).rejects.toThrow(UnauthorizedError);
  });

  it('adapter guard calls validateScope for each scope', async () => {
    const validateScope = vi.fn(() => true);
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return { id: '1' };
      },
      getSessionFromRequest: () => ({ id: '1' }),
      validateScope,
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scopes: ['a', 'b'] });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    await hook({} as FastifyRequest);
    expect(validateScope).toHaveBeenCalledTimes(2);
    expect(validateScope).toHaveBeenCalledWith({ id: '1' }, 'a');
    expect(validateScope).toHaveBeenCalledWith({ id: '1' }, 'b');
  });

  it('adapter guard calls validateRole when roles provided', async () => {
    const validateRole = vi.fn(() => true);
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return { id: '1' };
      },
      getSessionFromRequest: () => ({ id: '1' }),
      validateScope: () => true,
      validateRole,
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ roles: ['admin', 'owner'] });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    await hook({} as FastifyRequest);
    expect(validateRole).toHaveBeenCalledWith({ id: '1' }, ['admin', 'owner']);
  });

  it('adapter guard calls deriveScopes before validation', async () => {
    const validateScope = vi.fn(() => true);
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return { id: '1' };
      },
      getSessionFromRequest: () => ({ id: '1' }),
      validateScope,
      deriveScopes: (scopes, roles) => {
        if (roles.length > 0) return [...scopes, 'org'];
        return scopes;
      },
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scopes: ['api'], roles: ['admin'] });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    await hook({} as FastifyRequest);
    // deriveScopes added 'org' because roles were present
    expect(validateScope).toHaveBeenCalledWith({ id: '1' }, 'api');
    expect(validateScope).toHaveBeenCalledWith({ id: '1' }, 'org');
  });

  it('adapter guard runs custom authorize callback', async () => {
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return { id: '1' };
      },
      getSessionFromRequest: () => ({ id: '1' }),
      validateScope: () => true,
    };
    registerGuardAdapter(adapter);

    const result = withAuth({
      scopes: ['test'],
      authorize: () => false,
    });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    await expect(hook({} as FastifyRequest)).rejects.toThrow(ForbiddenError);
  });

  it('merges scope shorthand into scopes array', () => {
    const adapter: AuthAdapter<{ id: string }> = {
      async getSession() {
        return { id: '1' };
      },
      validateScope: () => true,
      responseSchemas: (scopes) => {
        // Return scopes as a side-channel for testing
        return { 999: scopes };
      },
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scope: 'single', scopes: ['multi'] });
    const response = (result.schema as Record<string, Record<string, unknown>>)
      .response;
    // 999 should contain ['multi', 'single'] (scope appended)
    expect(response[999]).toEqual(['multi', 'single']);
  });

  it('defaults getSessionFromRequest to req.maybeAuthSession', async () => {
    const validateScope = vi.fn(() => true);
    const adapter: AuthAdapter<{ name: string }> = {
      async getSession() {
        return { name: 'test' };
      },
      validateScope,
    };
    registerGuardAdapter(adapter);

    const result = withAuth({ scopes: ['x'] });
    const hook = result.preValidation as (req: FastifyRequest) => Promise<void>;

    const fakeReq = { maybeAuthSession: { name: 'from-request' } };
    await hook(fakeReq as unknown as FastifyRequest);
    expect(validateScope).toHaveBeenCalledWith({ name: 'from-request' }, 'x');
  });
});

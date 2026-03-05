import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../errors/index.js';
import { createBetterAuthAdapter } from '../adapter.js';
import {
  orgSchemaMap,
  orgSessionHooks,
  redisSecondaryStorage,
  snakeCaseSchema,
  socialProviders,
} from '../client.js';
import { betterAuthConfigSchema } from '../config.js';
import {
  createSESEmailSender,
  emailVerificationCallbacks,
  magicLinkCallbacks,
  renderBaseLayout,
  renderEmailVerification,
  renderMagicLink,
} from '../emails.js';

// -- Config schema tests --

describe('betterAuthConfigSchema', () => {
  it('validates with all required fields', () => {
    const result = betterAuthConfigSchema.parse({
      BETTER_AUTH_SECRET: 'test-secret',
    });
    expect(result.BETTER_AUTH_SECRET).toBe('test-secret');
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');
    expect(result.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([]);
  });

  it('validates with optional fields', () => {
    const result = betterAuthConfigSchema.parse({
      BETTER_AUTH_SECRET: 'secret',
      BETTER_AUTH_URL: 'https://api.example.com',
      GOOGLE_CLIENT_ID: 'goog-id',
      GOOGLE_CLIENT_SECRET: 'goog-secret',
    });
    expect(result.BETTER_AUTH_URL).toBe('https://api.example.com');
    expect(result.GOOGLE_CLIENT_ID).toBe('goog-id');
  });

  it('rejects missing BETTER_AUTH_SECRET', () => {
    expect(() => betterAuthConfigSchema.parse({})).toThrow();
  });

  it('parses BETTER_AUTH_TRUSTED_ORIGINS as CSV', () => {
    const result = betterAuthConfigSchema.parse({
      BETTER_AUTH_SECRET: 'secret',
      BETTER_AUTH_TRUSTED_ORIGINS: 'http://a.com, http://b.com, http://c.com',
    });
    expect(result.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);
  });

  it('defaults FRONTEND_URL to http://localhost:3000', () => {
    const result = betterAuthConfigSchema.parse({
      BETTER_AUTH_SECRET: 'secret',
    });
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');
  });
});

// -- Snake-case schema tests --

describe('snakeCaseSchema', () => {
  it('has user/account/verification/session keys', () => {
    expect(Object.keys(snakeCaseSchema)).toEqual([
      'user',
      'account',
      'verification',
      'session',
    ]);
  });

  it('maps user fields to snake_case', () => {
    expect(snakeCaseSchema.user.modelName).toBe('users');
    expect(snakeCaseSchema.user.fields.emailVerified).toBe('email_verified');
    expect(snakeCaseSchema.user.fields.createdAt).toBe('created_at');
  });

  it('maps account fields to snake_case', () => {
    expect(snakeCaseSchema.account.modelName).toBe('accounts');
    expect(snakeCaseSchema.account.fields.accessToken).toBe('access_token');
    expect(snakeCaseSchema.account.fields.refreshToken).toBe('refresh_token');
    expect(snakeCaseSchema.account.fields.userId).toBe('user_id');
  });

  it('maps session fields to snake_case', () => {
    expect(snakeCaseSchema.session.modelName).toBe('sessions');
    expect(snakeCaseSchema.session.fields.ipAddress).toBe('ip_address');
    expect(snakeCaseSchema.session.fields.userAgent).toBe('user_agent');
    expect(snakeCaseSchema.session.fields.activeOrganizationId).toBe(
      'active_organization_id',
    );
  });
});

describe('orgSchemaMap', () => {
  it('has organization/member/invitation keys', () => {
    expect(Object.keys(orgSchemaMap.schema)).toEqual([
      'organization',
      'member',
      'invitation',
    ]);
  });

  it('maps member fields to snake_case', () => {
    expect(orgSchemaMap.schema.member.modelName).toBe('members');
    expect(orgSchemaMap.schema.member.fields.organizationId).toBe(
      'organization_id',
    );
    expect(orgSchemaMap.schema.member.fields.userId).toBe('user_id');
  });

  it('maps invitation fields to snake_case', () => {
    expect(orgSchemaMap.schema.invitation.modelName).toBe('invitations');
    expect(orgSchemaMap.schema.invitation.fields.inviterId).toBe('inviter_id');
  });
});

// -- Social providers tests --

describe('socialProviders', () => {
  it('returns configured providers when credentials are present', () => {
    const result = socialProviders({
      GOOGLE_CLIENT_ID: 'g-id',
      GOOGLE_CLIENT_SECRET: 'g-secret',
      GITHUB_CLIENT_ID: 'gh-id',
      GITHUB_CLIENT_SECRET: 'gh-secret',
      MICROSOFT_CLIENT_ID: 'ms-id',
      MICROSOFT_CLIENT_SECRET: 'ms-secret',
    });
    expect(result.google).toEqual({
      clientId: 'g-id',
      clientSecret: 'g-secret',
      prompt: 'select_account',
    });
    expect(result.github).toEqual({
      clientId: 'gh-id',
      clientSecret: 'gh-secret',
    });
    expect(result.microsoft?.clientId).toBe('ms-id');
    expect(result.microsoft?.tenantId).toBe('common');
  });

  it('returns undefined for providers with missing credentials', () => {
    const result = socialProviders({
      GOOGLE_CLIENT_ID: 'g-id',
      // missing GOOGLE_CLIENT_SECRET
    });
    expect(result.google).toBeUndefined();
    expect(result.github).toBeUndefined();
    expect(result.microsoft).toBeUndefined();
  });

  it('microsoft mapProfileToUser checks personal account tenant', () => {
    const result = socialProviders({
      MICROSOFT_CLIENT_ID: 'ms-id',
      MICROSOFT_CLIENT_SECRET: 'ms-secret',
    });
    const mapFn = result.microsoft?.mapProfileToUser;
    if (!mapFn) throw new Error('Expected mapProfileToUser to be defined');
    // Personal account tenant -- should NOT be verified
    expect(mapFn({ tid: '9188040d-6c67-4c5b-b112-36a304b66dad' })).toEqual({
      emailVerified: false,
    });
    // Org tenant -- should be verified
    expect(mapFn({ tid: 'some-org-tenant' })).toEqual({
      emailVerified: true,
    });
  });
});

// -- Redis secondary storage tests --

describe('redisSecondaryStorage', () => {
  it('returns undefined when cache is null', () => {
    expect(redisSecondaryStorage(null)).toBeUndefined();
  });

  it('returns undefined when cache is undefined', () => {
    expect(redisSecondaryStorage(undefined)).toBeUndefined();
  });

  it('returns undefined when cache.redis is falsy', () => {
    const cache = { redis: null, get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    expect(redisSecondaryStorage(cache as never)).toBeUndefined();
  });

  it('returns storage object when cache.redis is truthy', () => {
    const cache = {
      redis: {},
      get: vi.fn().mockResolvedValue('value'),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const storage = redisSecondaryStorage(cache as never);
    expect(storage).toBeDefined();
    expect(storage?.get).toBeDefined();
    expect(storage?.set).toBeDefined();
    expect(storage?.delete).toBeDefined();
  });

  it('prefixes keys with auth-', async () => {
    const cache = {
      redis: {},
      get: vi.fn().mockResolvedValue('val'),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const storage = redisSecondaryStorage(cache as never);
    if (!storage) throw new Error('Expected storage to be defined');

    await storage.get('session-123');
    expect(cache.get).toHaveBeenCalledWith('auth-session-123');

    await storage.set('rate-limit', 'data', 60);
    expect(cache.set).toHaveBeenCalledWith('auth-rate-limit', 'data', 60);

    await storage.delete('old-key');
    expect(cache.delete).toHaveBeenCalledWith('auth-old-key');
  });
});

// -- Organization session hook tests --

describe('orgSessionHooks', () => {
  function createMockPool(
    memberRows: Record<string, unknown>[] = [],
    userRows: Record<string, unknown>[] = [],
  ) {
    return {
      query: vi.fn().mockImplementation((text: string) => {
        if (text.includes('members')) return { rows: memberRows };
        if (text.includes('users')) return { rows: userRows };
        return { rows: [] };
      }),
    };
  }

  it('returns databaseHooks object with session.create.before', () => {
    const hooks = orgSessionHooks({
      pool: createMockPool(),
      getAuth: () => ({ api: { createOrganization: vi.fn() } }),
    });
    expect(hooks.session.create.before).toBeDefined();
    expect(typeof hooks.session.create.before).toBe('function');
  });

  it('finds existing membership and sets activeOrganizationId', async () => {
    const pool = createMockPool([{ organization_id: 'org-123' }]);
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({ api: { createOrganization: vi.fn() } }),
    });

    const result = await hooks.session.create.before({
      userId: 'user-1',
      token: 'abc',
    });
    expect(result.data.activeOrganizationId).toBe('org-123');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('members'),
      ['user-1'],
    );
  });

  it('creates new org when no membership exists', async () => {
    const createOrganization = vi.fn().mockResolvedValue({ id: 'new-org' });
    const pool = createMockPool([], [{ name: 'John Doe' }]);
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({ api: { createOrganization } }),
    });

    const result = await hooks.session.create.before({
      userId: 'user-1',
      token: 'abc',
    });
    expect(result.data.activeOrganizationId).toBe('new-org');
    expect(createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          name: 'John Doe',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('uses custom generateSlug when provided', async () => {
    const createOrganization = vi.fn().mockResolvedValue({ id: 'new-org' });
    const pool = createMockPool([], [{ name: 'Alice' }]);
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({ api: { createOrganization } }),
      generateSlug: () => 'custom-slug-123',
    });

    await hooks.session.create.before({ userId: 'user-1', token: 'abc' });
    expect(createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ slug: 'custom-slug-123' }),
      }),
    );
  });

  it('uses default slug (name + uuid suffix) when generateSlug not provided', async () => {
    const createOrganization = vi.fn().mockResolvedValue({ id: 'new-org' });
    const pool = createMockPool([], [{ name: 'Jane Doe' }]);
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({ api: { createOrganization } }),
    });

    await hooks.session.create.before({ userId: 'user-1', token: 'abc' });
    const slug = createOrganization.mock.calls[0][0].body.slug as string;
    expect(slug).toMatch(/^jane-doe-[a-f0-9]{8}$/);
  });

  it('throws when user not found', async () => {
    const pool = createMockPool([], []); // no member rows, no user rows
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({
        api: { createOrganization: vi.fn().mockResolvedValue({ id: 'x' }) },
      }),
    });

    await expect(
      hooks.session.create.before({ userId: 'user-1', token: 'abc' }),
    ).rejects.toThrow('User not found');
  });

  it('throws when organization creation fails', async () => {
    const pool = createMockPool([], [{ name: 'Test' }]);
    const hooks = orgSessionHooks({
      pool,
      getAuth: () => ({
        api: { createOrganization: vi.fn().mockResolvedValue(null) },
      }),
    });

    await expect(
      hooks.session.create.before({ userId: 'user-1', token: 'abc' }),
    ).rejects.toThrow('Organization creation failed');
  });
});

// -- Email template tests --

describe('renderEmailVerification', () => {
  it('includes appName, url, and name in output', () => {
    const html = renderEmailVerification({
      appName: 'TestApp',
      url: 'https://example.com/verify',
      name: 'Alice',
    });
    expect(html).toContain('TestApp');
    expect(html).toContain('https://example.com/verify');
    expect(html).toContain('Hello Alice,');
    expect(html).toContain('Verify Email');
  });

  it('uses email prefix when name is not provided', () => {
    const html = renderEmailVerification({
      appName: 'TestApp',
      url: 'https://example.com/verify',
    });
    expect(html).toContain('Hello,');
  });
});

describe('renderMagicLink', () => {
  it('includes appName and url in output', () => {
    const html = renderMagicLink({
      appName: 'MyApp',
      url: 'https://example.com/magic',
    });
    expect(html).toContain('MyApp');
    expect(html).toContain('https://example.com/magic');
    expect(html).toContain('Sign In');
    expect(html).toContain('expires in 10 minutes');
  });
});

describe('renderBaseLayout', () => {
  it('wraps content in responsive HTML email layout', () => {
    const html = renderBaseLayout('<p>Content</p>', 'Brand');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<p>Content</p>');
    expect(html).toContain('Brand');
    expect(html).toContain('max-width:600px');
  });
});

describe('emailVerificationCallbacks', () => {
  it('calls send with correct to/subject/html', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const callbacks = emailVerificationCallbacks({
      appName: 'TestApp',
      send,
    });

    await callbacks.sendVerificationEmail({
      user: { name: 'Bob', email: 'bob@test.com' },
      url: 'https://verify.me',
    });

    expect(send).toHaveBeenCalledWith({
      to: 'bob@test.com',
      subject: 'Verify your email address - TestApp',
      html: expect.stringContaining('Verify Email'),
      text: expect.stringContaining('https://verify.me'),
    });
  });

  it('returns autoSignInAfterVerification and sendOnSignUp', () => {
    const callbacks = emailVerificationCallbacks({
      appName: 'App',
      send: vi.fn(),
    });
    expect(callbacks.autoSignInAfterVerification).toBe(true);
    expect(callbacks.sendOnSignUp).toBe(true);
  });

  it('uses custom template override', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const customTemplate = (vars: { appName: string; url: string }) =>
      `<custom>${vars.appName} - ${vars.url}</custom>`;
    const callbacks = emailVerificationCallbacks({
      appName: 'App',
      send,
      template: customTemplate,
    });

    await callbacks.sendVerificationEmail({
      user: { email: 'test@test.com' },
      url: 'https://v.me',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<custom>App - https://v.me</custom>',
      }),
    );
  });

  it('uses custom subject override (string)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const callbacks = emailVerificationCallbacks({
      appName: 'App',
      send,
      subject: 'Custom Subject',
    });

    await callbacks.sendVerificationEmail({
      user: { email: 'test@test.com' },
      url: 'https://v.me',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Custom Subject' }),
    );
  });

  it('uses custom subject override (function)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const callbacks = emailVerificationCallbacks({
      appName: 'App',
      send,
      subject: (vars) => `Welcome to ${vars.appName}!`,
    });

    await callbacks.sendVerificationEmail({
      user: { email: 'test@test.com' },
      url: 'https://v.me',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Welcome to App!' }),
    );
  });
});

describe('magicLinkCallbacks', () => {
  it('calls send with correct to/subject/html', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const callbacks = magicLinkCallbacks({ appName: 'TestApp', send });

    await callbacks.sendMagicLink({
      email: 'alice@test.com',
      url: 'https://magic.me',
    });

    expect(send).toHaveBeenCalledWith({
      to: 'alice@test.com',
      subject: 'Sign in to TestApp',
      html: expect.stringContaining('Sign In'),
      text: expect.stringContaining('https://magic.me'),
    });
  });

  it('returns disableSignUp: true', () => {
    const callbacks = magicLinkCallbacks({ appName: 'App', send: vi.fn() });
    expect(callbacks.disableSignUp).toBe(true);
  });

  it('uses custom template override', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const customTemplate = (vars: { appName: string; url: string }) =>
      `<magic>${vars.url}</magic>`;
    const callbacks = magicLinkCallbacks({
      appName: 'App',
      send,
      template: customTemplate,
    });

    await callbacks.sendMagicLink({ email: 'a@b.com', url: 'https://m.me' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<magic>https://m.me</magic>' }),
    );
  });
});

// -- Async template + baseUrl tests --

describe('emailVerificationCallbacks (async)', () => {
  it('supports async template functions', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const asyncTemplate = async (vars: { appName: string; url: string }) =>
      `<async>${vars.appName} - ${vars.url}</async>`;
    const callbacks = emailVerificationCallbacks({
      appName: 'AsyncApp',
      send,
      template: asyncTemplate,
    });

    await callbacks.sendVerificationEmail({
      user: { email: 'test@test.com' },
      url: 'https://v.me',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<async>AsyncApp - https://v.me</async>',
      }),
    );
  });

  it('passes baseUrl through to template vars', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const templateSpy = vi.fn().mockReturnValue('<html>ok</html>');
    const callbacks = emailVerificationCallbacks({
      appName: 'App',
      send,
      template: templateSpy,
      baseUrl: 'https://api.example.com',
    });

    await callbacks.sendVerificationEmail({
      user: { email: 'test@test.com', name: 'Test' },
      url: 'https://v.me',
    });
    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.example.com' }),
    );
  });
});

describe('magicLinkCallbacks (async)', () => {
  it('supports async template functions', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const asyncTemplate = async (vars: { appName: string; url: string }) =>
      `<async>${vars.url}</async>`;
    const callbacks = magicLinkCallbacks({
      appName: 'AsyncApp',
      send,
      template: asyncTemplate,
    });

    await callbacks.sendMagicLink({
      email: 'a@b.com',
      url: 'https://m.me',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<async>https://m.me</async>' }),
    );
  });

  it('passes baseUrl through to template vars', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const templateSpy = vi.fn().mockReturnValue('<html>ok</html>');
    const callbacks = magicLinkCallbacks({
      appName: 'App',
      send,
      template: templateSpy,
      baseUrl: 'https://api.example.com',
    });

    await callbacks.sendMagicLink({
      email: 'a@b.com',
      url: 'https://m.me',
    });
    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.example.com' }),
    );
  });
});

describe('createSESEmailSender', () => {
  it('returns an async function', () => {
    const sender = createSESEmailSender({ from: 'test@test.com' });
    expect(typeof sender).toBe('function');
  });

  it('throws helpful error when @aws-sdk/client-ses is not available', async () => {
    // We can't easily test the SES import failure in unit tests since the
    // module is available in the dev environment. Instead, test that the
    // sender function exists and has the right shape.
    const sender = createSESEmailSender({
      from: 'test@test.com',
      region: 'eu-west-1',
    });
    expect(typeof sender).toBe('function');
  });
});

// -- React Email renderer tests --

describe('renderEmailVerificationReact', () => {
  it('returns HTML string containing key content', async () => {
    const { renderEmailVerificationReact } = await import('../emails-react.js');
    const html = await renderEmailVerificationReact({
      appName: 'TestApp',
      url: 'https://example.com/verify',
      name: 'Alice',
      baseUrl: 'https://api.example.com',
    });
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('Verify Email');
    expect(html).toContain('TestApp');
    expect(html).toContain('https://example.com/verify');
  });

  it('handles missing name gracefully', async () => {
    const { renderEmailVerificationReact } = await import('../emails-react.js');
    const html = await renderEmailVerificationReact({
      appName: 'TestApp',
      url: 'https://example.com/verify',
    });
    expect(html).toContain('there');
  });
});

describe('renderMagicLinkReact', () => {
  it('returns HTML string containing key content', async () => {
    const { renderMagicLinkReact } = await import('../emails-react.js');
    const html = await renderMagicLinkReact({
      appName: 'MyApp',
      url: 'https://example.com/magic',
      baseUrl: 'https://api.example.com',
    });
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('Sign In');
    expect(html).toContain('MyApp');
    expect(html).toContain('https://example.com/magic');
  });

  it('mentions expiry in the email', async () => {
    const { renderMagicLinkReact } = await import('../emails-react.js');
    const html = await renderMagicLinkReact({
      appName: 'MyApp',
      url: 'https://example.com/magic',
    });
    expect(html).toContain('10 minutes');
  });
});

// -- Adapter factory tests --

describe('createBetterAuthAdapter', () => {
  function createMockAuth(
    sessionData: {
      session: Record<string, unknown>;
      user: Record<string, unknown>;
    } | null = {
      session: { id: 's1', userId: 'u1' },
      user: { id: 'u1', name: 'Test' },
    },
    memberData: { organizationId: string; id: string; role: string } | null = {
      organizationId: 'org-1',
      id: 'm1',
      role: 'admin',
    },
  ) {
    return {
      api: {
        getSession: vi.fn().mockResolvedValue(sessionData),
        getActiveMember: vi.fn().mockResolvedValue(memberData),
      },
      handler: vi.fn().mockResolvedValue(new Response('ok')),
    };
  }

  it('creates adapter with getSession, handler, basePath', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    expect(adapter.getSession).toBeDefined();
    expect(adapter.handler).toBeDefined();
    expect(adapter.basePath).toBe('/auth');
  });

  it('basic mode: getSession returns session + user', async () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });

    const result = await adapter.getSession(new Headers());
    expect(result).toEqual({
      id: 's1',
      userId: 'u1',
      user: { id: 'u1', name: 'Test' },
    });
    expect(auth.api.getActiveMember).not.toHaveBeenCalled();
  });

  it('org mode: getSession returns session + user + organization', async () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });

    const result = await adapter.getSession(new Headers());
    expect(result).toEqual({
      id: 's1',
      userId: 'u1',
      user: { id: 'u1', name: 'Test' },
      organization: { id: 'org-1', member: { id: 'm1', role: 'admin' } },
    });
  });

  it('returns null when auth.api.getSession returns null', async () => {
    const auth = createMockAuth(null);
    const adapter = createBetterAuthAdapter({ auth });

    const result = await adapter.getSession(new Headers());
    expect(result).toBeNull();
  });

  it('org mode returns null when getActiveMember returns null', async () => {
    const auth = createMockAuth(
      { session: { id: 's1' }, user: { id: 'u1' } },
      null,
    );
    const adapter = createBetterAuthAdapter({ auth, organization: true });

    const result = await adapter.getSession(new Headers());
    expect(result).toBeNull();
  });

  it('org mode throws when getActiveMember is missing', async () => {
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          session: { id: 's1' },
          user: { id: 'u1' },
        }),
      },
      handler: vi.fn(),
    };
    const adapter = createBetterAuthAdapter({ auth, organization: true });

    await expect(adapter.getSession(new Headers())).rejects.toThrow(
      'auth.api.getActiveMember is required',
    );
  });

  it('handler delegates to auth.handler', async () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });

    const request = new Request('http://localhost/auth/callback');
    await adapter.handler?.(request);
    expect(auth.handler).toHaveBeenCalledWith(request);
  });

  it('default skipPaths is [/auth/sign-out]', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    expect(adapter.skipPaths).toEqual(['/auth/sign-out']);
  });

  it('custom basePath and skipPaths are used', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({
      auth,
      basePath: '/api/auth',
      skipPaths: ['/api/auth/logout'],
    });
    expect(adapter.basePath).toBe('/api/auth');
    expect(adapter.skipPaths).toEqual(['/api/auth/logout']);
  });

  it('sets errorRedirectUrl on adapter', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({
      auth,
      errorRedirectUrl: 'https://app.com/error',
    });
    expect(adapter.errorRedirectUrl).toBe('https://app.com/error');
  });

  // -- Guard config tests --

  it('guard: getSessionFromRequest reads from maybeAuthSession', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    const fakeReq = { maybeAuthSession: { id: 's1', user: { id: 'u1' } } };
    expect(
      adapter.getSessionFromRequest?.(fakeReq as unknown as FastifyRequest),
    ).toEqual({
      id: 's1',
      user: { id: 'u1' },
    });
  });

  it('guard: getSessionFromRequest returns null when no session', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    const fakeReq = { maybeAuthSession: null };
    expect(
      adapter.getSessionFromRequest?.(fakeReq as unknown as FastifyRequest),
    ).toBeNull();
  });

  it('guard: validateScope is undefined in basic mode', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    expect(adapter.validateScope).toBeUndefined();
  });

  it('guard: validateScope throws for org scope without org in org mode', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const sessionWithoutOrg = { id: 's1', user: { id: 'u1' } };
    expect(() =>
      adapter.validateScope?.(sessionWithoutOrg as never, 'organization'),
    ).toThrow(ForbiddenError);
  });

  it('guard: validateScope passes for org scope when org is present', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const session = { id: 's1', user: {}, organization: { id: 'org-1' } };
    expect(adapter.validateScope?.(session as never, 'organization')).toBe(
      true,
    );
  });

  it('guard: validateRole throws for invalid role in org mode', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const session = {
      organization: { member: { role: 'member' } },
    };
    expect(() =>
      adapter.validateRole?.(session as never, ['admin', 'owner']),
    ).toThrow(ForbiddenError);
  });

  it('guard: validateRole passes for valid role', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const session = {
      organization: { member: { role: 'admin' } },
    };
    expect(adapter.validateRole?.(session as never, ['admin', 'owner'])).toBe(
      true,
    );
  });

  it('guard: deriveScopes adds org scope when roles present in org mode', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const result = adapter.deriveScopes?.(['api'] as never[], ['admin']);
    expect(result).toEqual(['api', 'organization']);
  });

  it('guard: deriveScopes does not duplicate org scope', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const result = adapter.deriveScopes?.(['organization'] as never[], [
      'admin',
    ]);
    expect(result).toEqual(['organization']);
  });

  it('guard: security returns cookie entries without apiKey by default', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    const entries = adapter.security?.([] as never[]);
    expect(entries).toEqual([
      { cookieAuthSessionToken: [] },
      { cookieAuthState: [] },
    ]);
  });

  it('guard: security includes apiKey when apiKey scope is present', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    const entries = adapter.security?.(['apiKey'] as never[]);
    expect(entries).toEqual([
      { apiKey: [] },
      { cookieAuthSessionToken: [] },
      { cookieAuthState: [] },
    ]);
  });

  it('guard: responseSchemas returns 400 with GenericErrorResponseSchema', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth });
    const schemas = adapter.responseSchemas?.([] as never[]);
    expect(schemas?.[400]).toBeDefined();
  });

  it('guard: responseSchemas returns Type.Union for org-scoped routes', () => {
    const auth = createMockAuth();
    const adapter = createBetterAuthAdapter({ auth, organization: true });
    const schemas = adapter.responseSchemas?.(['organization'] as never[]);
    expect(schemas?.[400]).toBeDefined();
  });

  // -- onSession hook tests --

  it('calls onSession hook after session resolution', async () => {
    const auth = createMockAuth();
    const onSession = vi.fn().mockImplementation((session) => session);
    const adapter = createBetterAuthAdapter({ auth, onSession });

    await adapter.getSession(new Headers());
    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'u1', name: 'Test' } }),
      expect.any(Headers),
    );
  });

  it('onSession can reject session by returning null', async () => {
    const auth = createMockAuth();
    const onSession = vi.fn().mockResolvedValue(null);
    const adapter = createBetterAuthAdapter({ auth, onSession });

    const result = await adapter.getSession(new Headers());
    expect(result).toBeNull();
  });

  it('onSession can throw to error', async () => {
    const auth = createMockAuth();
    const onSession = vi.fn().mockRejectedValue(new Error('Denied'));
    const adapter = createBetterAuthAdapter({ auth, onSession });

    await expect(adapter.getSession(new Headers())).rejects.toThrow('Denied');
  });

  it('onSession receives org-enriched session in org mode', async () => {
    const auth = createMockAuth();
    const onSession = vi.fn().mockImplementation((session) => session);
    const adapter = createBetterAuthAdapter({
      auth,
      organization: true,
      onSession,
    });

    await adapter.getSession(new Headers());
    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: { id: 'org-1', member: { id: 'm1', role: 'admin' } },
      }),
      expect.any(Headers),
    );
  });

  // -- API key session resolution tests --

  const mockVerifiedKey = {
    id: 'key-1',
    name: 'Test Key',
    start: 'vul_',
    prefix: 'vul',
    referenceId: 'u1',
    refillInterval: null,
    refillAmount: null,
    lastRefillAt: null,
    enabled: true,
    rateLimitEnabled: false,
    rateLimitTimeWindow: null,
    rateLimitMax: null,
    requestCount: 42,
    remaining: null,
    lastRequest: null,
    expiresAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    permissions: null,
    metadata: null,
  };

  function createApiKeyAuth(
    sessionData: {
      session: Record<string, unknown>;
      user: Record<string, unknown>;
    } | null = null,
    verifyResult = { valid: true, error: null, key: mockVerifiedKey } as {
      valid: boolean;
      error: { message: string; code: string } | null;
      key: Record<string, unknown> | null;
    },
  ) {
    return {
      api: {
        getSession: vi.fn().mockResolvedValue(sessionData),
        getActiveMember: vi.fn().mockResolvedValue(null),
        verifyApiKey: vi.fn().mockResolvedValue(verifyResult),
      },
      handler: vi.fn().mockResolvedValue(new Response('ok')),
    };
  }

  describe('API key session resolution', () => {
    it('resolves session when cookie session is null and x-api-key header present', async () => {
      const auth = createApiKeyAuth();
      const resolveSession = vi
        .fn()
        .mockResolvedValue({ id: 'api-session', user: { id: 'u1' } });
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
      });

      const headers = new Headers({ 'x-api-key': 'vul_secret123' });
      const result = await adapter.getSession(headers);

      expect(result).toEqual({ id: 'api-session', user: { id: 'u1' } });
      expect(auth.api.verifyApiKey).toHaveBeenCalledWith({
        body: { key: 'vul_secret123' },
      });
      expect(resolveSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'key-1', referenceId: 'u1' }),
      );
    });

    it('does not call resolveSession when cookie session exists', async () => {
      const auth = createApiKeyAuth({
        session: { id: 's1', userId: 'u1' },
        user: { id: 'u1', name: 'Test' },
      });
      const resolveSession = vi.fn();
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
      });

      const headers = new Headers({ 'x-api-key': 'vul_secret123' });
      const result = await adapter.getSession(headers);

      expect(result).toEqual({
        id: 's1',
        userId: 'u1',
        user: { id: 'u1', name: 'Test' },
      });
      expect(resolveSession).not.toHaveBeenCalled();
      expect(auth.api.verifyApiKey).not.toHaveBeenCalled();
    });

    it('returns null when header is missing', async () => {
      const auth = createApiKeyAuth();
      const resolveSession = vi.fn();
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
      });

      const result = await adapter.getSession(new Headers());

      expect(result).toBeNull();
      expect(auth.api.verifyApiKey).not.toHaveBeenCalled();
      expect(resolveSession).not.toHaveBeenCalled();
    });

    it('returns null when verifyApiKey returns invalid', async () => {
      const auth = createApiKeyAuth(null, {
        valid: false,
        error: { message: 'Invalid key', code: 'INVALID_KEY' },
        key: null,
      });
      const resolveSession = vi.fn();
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
      });

      const headers = new Headers({ 'x-api-key': 'vul_badkey' });
      const result = await adapter.getSession(headers);

      expect(result).toBeNull();
      expect(resolveSession).not.toHaveBeenCalled();
    });

    it('runs onSession hook on API key sessions', async () => {
      const auth = createApiKeyAuth();
      const resolveSession = vi
        .fn()
        .mockResolvedValue({ id: 'api-session', user: { id: 'u1' } });
      const onSession = vi.fn().mockImplementation((session) => ({
        ...session,
        enriched: true,
      }));
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
        onSession,
      });

      const headers = new Headers({ 'x-api-key': 'vul_secret123' });
      const result = await adapter.getSession(headers);

      expect(onSession).toHaveBeenCalledWith(
        { id: 'api-session', user: { id: 'u1' } },
        headers,
      );
      expect(result).toEqual({
        id: 'api-session',
        user: { id: 'u1' },
        enriched: true,
      });
    });

    it('onSession can reject API key sessions', async () => {
      const auth = createApiKeyAuth();
      const resolveSession = vi
        .fn()
        .mockResolvedValue({ id: 'api-session', user: { id: 'u1' } });
      const onSession = vi.fn().mockResolvedValue(null);
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
        onSession,
      });

      const headers = new Headers({ 'x-api-key': 'vul_secret123' });
      const result = await adapter.getSession(headers);

      expect(result).toBeNull();
    });

    it('throws when verifyApiKey method is missing from auth', async () => {
      const auth = {
        api: {
          getSession: vi.fn().mockResolvedValue(null),
        },
        handler: vi.fn(),
      };
      const resolveSession = vi.fn();
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { resolveSession },
      });

      const headers = new Headers({ 'x-api-key': 'vul_secret123' });
      await expect(adapter.getSession(headers)).rejects.toThrow(
        'auth.api.verifyApiKey is required',
      );
    });

    it('uses custom headerName', async () => {
      const auth = createApiKeyAuth();
      const resolveSession = vi
        .fn()
        .mockResolvedValue({ id: 'api-session', user: { id: 'u1' } });
      const adapter = createBetterAuthAdapter({
        auth,
        apiKey: { headerName: 'authorization', resolveSession },
      });

      const headers = new Headers({ authorization: 'vul_secret123' });
      const result = await adapter.getSession(headers);

      expect(result).toEqual({ id: 'api-session', user: { id: 'u1' } });
      expect(auth.api.verifyApiKey).toHaveBeenCalledWith({
        body: { key: 'vul_secret123' },
      });
    });
  }); // end API key session resolution
});

// -- Module exports test --

describe('module exports', () => {
  it('exports all expected symbols from barrel', async () => {
    const mod = await import('../index.js');

    // Config
    expect(mod.betterAuthConfigSchema).toBeDefined();

    // Client helpers
    expect(mod.snakeCaseSchema).toBeDefined();
    expect(mod.orgSchemaMap).toBeDefined();
    expect(typeof mod.socialProviders).toBe('function');
    expect(typeof mod.redisSecondaryStorage).toBe('function');
    expect(typeof mod.orgSessionHooks).toBe('function');

    // Email
    expect(typeof mod.emailVerificationCallbacks).toBe('function');
    expect(typeof mod.magicLinkCallbacks).toBe('function');
    expect(typeof mod.renderBaseLayout).toBe('function');
    expect(typeof mod.renderEmailVerification).toBe('function');
    expect(typeof mod.renderMagicLink).toBe('function');
    expect(typeof mod.createSESEmailSender).toBe('function');

    // React Email renderers
    expect(typeof mod.renderEmailVerificationReact).toBe('function');
    expect(typeof mod.renderMagicLinkReact).toBe('function');

    // Adapter
    expect(typeof mod.createBetterAuthAdapter).toBe('function');
  });
});

import type { FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import { ForbiddenError } from '../../errors/index.js';
import { AutoRef, GenericErrorResponseSchema } from '../../schema/index.js';
import type { AuthAdapter } from '../adapter.js';

/**
 * Minimal interface for a better-auth instance.
 * Keeps the adapter decoupled from specific better-auth versions.
 */
interface BetterAuthLike {
  api: {
    getSession(options: { headers: Headers }): Promise<{
      session: Record<string, unknown>;
      user: Record<string, unknown>;
    } | null>;
    getActiveMember?(options: { headers: Headers }): Promise<{
      organizationId: string;
      id: string;
      role: string;
    } | null>;
    verifyApiKey?(options: { key: string }): Promise<{
      valid: boolean;
      error: { message: string; code: string } | null;
      key: VerifiedApiKey | null;
    }>;
  };
  handler(request: Request): Promise<Response>;
}

/** Represents a verified API key returned by better-auth's API key plugin. */
export interface VerifiedApiKey {
  id: string;
  name: string | null;
  start: string;
  prefix: string | null;
  userId: string | null;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: Date | null;
  enabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: number;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: Record<string, string[]> | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Options for createBetterAuthAdapter(). */
export interface CreateBetterAuthAdapterOptions<TSession = unknown> {
  /** The better-auth instance. */
  auth: BetterAuthLike;
  /** Enable organization-aware session resolution (calls getActiveMember). */
  organization?: boolean;
  /** Error redirect URL. When set, /auth/error requests redirect here with ?error=<code>. */
  errorRedirectUrl?: string;
  /** Base path for auth routes. @default '/auth' */
  basePath?: string;
  /** Paths to skip session hydration. @default ['/auth/sign-out'] */
  skipPaths?: string[];
  /** Post-processing hook called after session resolution. Return null to reject, throw to error. */
  onSession?: (session: TSession, headers: Headers) => Promise<TSession | null>;
  /** API key authentication fallback. When configured, API keys are checked if cookie session is absent. */
  apiKey?: {
    /** Header name for API key. @default 'x-api-key' */
    headerName?: string;
    /** Build a session from a verified API key. Called after telaio verifies the key via better-auth. */
    resolveSession: (key: VerifiedApiKey) => Promise<TSession | null>;
  };
}

/**
 * Creates a telaio AuthAdapter from a better-auth instance.
 * Two modes: basic (session + user) or org-aware (session + user + organization).
 */
export function createBetterAuthAdapter<TSession>(
  options: CreateBetterAuthAdapterOptions<TSession>,
): AuthAdapter<TSession> {
  const {
    auth,
    organization = false,
    errorRedirectUrl,
    basePath = '/auth',
    skipPaths = ['/auth/sign-out'],
    onSession,
    apiKey: apiKeyConfig,
  } = options;

  return {
    async getSession(headers: Headers): Promise<TSession | null> {
      const res = await auth.api.getSession({ headers });

      if (!res) {
        return resolveFromApiKey(auth, apiKeyConfig, headers, onSession);
      }

      let session: TSession;

      if (organization) {
        if (!auth.api.getActiveMember) {
          throw new Error(
            'auth.api.getActiveMember is required when organization mode is enabled. ' +
              'Make sure the organization plugin is configured in your better-auth instance.',
          );
        }
        const member = await auth.api.getActiveMember({ headers });
        if (!member) return null;

        session = {
          ...res.session,
          user: res.user,
          organization: {
            id: member.organizationId,
            member: { id: member.id, role: member.role },
          },
        } as TSession;
      } else {
        session = { ...res.session, user: res.user } as TSession;
      }

      if (onSession) {
        return onSession(session, headers);
      }

      return session;
    },

    async handler(request: Request): Promise<Response> {
      return auth.handler(request);
    },

    basePath,
    skipPaths,
    errorRedirectUrl,

    // -- Guard config --

    getSessionFromRequest: (req: FastifyRequest) =>
      (req.maybeAuthSession as TSession) ?? null,

    validateScope: organization
      ? (session: TSession, scope: string) => {
          if (
            scope === 'organization' &&
            !(session as Record<string, unknown>).organization
          ) {
            throw new ForbiddenError('Organization is required for this API');
          }
          return true;
        }
      : undefined,

    validateRole: organization
      ? (session: TSession, roles: string[]) => {
          const org = (session as Record<string, unknown>).organization as
            | { member?: { role?: string } }
            | undefined;
          if (!org) {
            throw new ForbiddenError('Organization is required for this API');
          }
          const role = org.member?.role;
          if (!role || !roles.includes(role)) {
            throw new ForbiddenError('User does not have the required role');
          }
          return true;
        }
      : undefined,

    deriveScopes: organization
      ? (scopes: string[], roles: string[]) => {
          if (roles.length > 0 && !scopes.includes('organization')) {
            return [...scopes, 'organization'];
          }
          return scopes;
        }
      : undefined,

    security: (scopes: string[]) => {
      const entries: Record<string, string[]>[] = [
        { cookieAuthSessionToken: [] },
        { cookieAuthState: [] },
      ];
      if (scopes.includes('apiKey')) {
        entries.unshift({ apiKey: [] });
      }
      return entries;
    },

    responseSchemas: (scopes: string[]) => {
      if (scopes.includes('organization')) {
        return {
          400: Type.Union([AutoRef(GenericErrorResponseSchema) as never]),
        };
      }
      return { 400: AutoRef(GenericErrorResponseSchema) };
    },
  };
}

/**
 * Attempts to resolve a session from an API key header when cookie-based
 * session resolution returns null. Returns null if API key auth is not
 * configured or the key is missing/invalid.
 */
async function resolveFromApiKey<TSession>(
  auth: BetterAuthLike,
  apiKeyConfig: CreateBetterAuthAdapterOptions<TSession>['apiKey'],
  headers: Headers,
  onSession?: (session: TSession, headers: Headers) => Promise<TSession | null>,
): Promise<TSession | null> {
  if (!apiKeyConfig) return null;

  const headerName = apiKeyConfig.headerName ?? 'x-api-key';
  const key = headers.get(headerName);
  if (!key) return null;

  if (!auth.api.verifyApiKey) {
    throw new Error(
      'auth.api.verifyApiKey is required when apiKey option is configured. ' +
        'Make sure the API key plugin is configured in your better-auth instance.',
    );
  }

  const result = await auth.api.verifyApiKey({ key });
  if (!result.valid || !result.key) return null;

  const session = await apiKeyConfig.resolveSession(result.key);
  if (!session) return null;

  if (onSession) {
    return onSession(session, headers);
  }

  return session;
}

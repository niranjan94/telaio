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
  };
  handler(request: Request): Promise<Response>;
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
  } = options;

  return {
    async getSession(headers: Headers): Promise<TSession | null> {
      const res = await auth.api.getSession({ headers });
      if (!res) return null;

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
        entries.push({ apiKey: [] });
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

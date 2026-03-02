import type { RouteOptions } from 'fastify';
import { ForbiddenError } from '../errors/index.js';
import {
  AutoRef,
  BadRequestErrorResponseSchema,
  ForbiddenResponseSchema,
  UnauthorizedResponseSchema,
} from '../schema/index.js';

/** Options for the withAuth route guard. */
export interface WithAuthOptions<TSession = unknown> {
  /** User-defined scope strings that the session must satisfy. */
  scopes?: string[];
  /** User-defined role strings that the session must satisfy. */
  roles?: string[];
  /**
   * Custom authorization check. Receives the session, return false to deny.
   * Runs after scope/role checks.
   */
  authorize?: (session: TSession) => boolean | Promise<boolean>;
  /** Additional route schema to merge (e.g., custom headers, params). */
  schema?: RouteOptions['schema'];
}

/**
 * Returns route options with a preValidation hook that enforces authentication.
 * The hook checks that req.getAuthSession() succeeds, then runs optional
 * scope/role/authorize checks.
 *
 * Also injects standard error response schemas for OpenAPI documentation.
 */
export function withAuth<TSession = unknown>(
  options?: WithAuthOptions<TSession>,
): Partial<RouteOptions> {
  const userSchema = options?.schema ?? {};

  // Merge standard error responses into the route schema
  const responseSchemas = {
    400: AutoRef(BadRequestErrorResponseSchema),
    401: AutoRef(UnauthorizedResponseSchema),
    403: AutoRef(ForbiddenResponseSchema),
    ...((userSchema as Record<string, unknown>).response as
      | Record<string, unknown>
      | undefined),
  };

  const schema = {
    ...userSchema,
    response: responseSchemas,
  };

  return {
    schema,
    preValidation: async (request) => {
      // 1. Ensure authenticated
      const session = request.getAuthSession();

      // 2. Check scopes (user-defined strings)
      if (options?.scopes && options.scopes.length > 0) {
        // Session must have a 'scopes' or 'scope' array-like property
        const s = session as Record<string, unknown>;
        const sessionScopes = (s.scopes ?? s.scope ?? []) as unknown[];
        const sessionScopeSet = new Set(
          Array.isArray(sessionScopes) ? sessionScopes : [sessionScopes],
        );

        const hasScope = options.scopes.some((sc) => sessionScopeSet.has(sc));
        if (!hasScope) {
          throw new ForbiddenError(
            'You do not have the required scope for this action.',
          );
        }
      }

      // 3. Check roles (user-defined strings)
      if (options?.roles && options.roles.length > 0) {
        // Session must have a 'role' property (possibly nested)
        const s = session as Record<string, unknown>;
        const member = s.member as Record<string, unknown> | undefined;
        const org = s.organization as Record<string, unknown> | undefined;
        const orgMember = org?.member as Record<string, unknown> | undefined;
        const role = (s.role ?? member?.role ?? orgMember?.role) as
          | string
          | undefined;

        if (!role || !options.roles.includes(role)) {
          throw new ForbiddenError(
            'You do not have the required role for this action.',
          );
        }
      }

      // 4. Custom authorize callback
      if (options?.authorize) {
        const allowed = await options.authorize(
          session as Parameters<NonNullable<typeof options.authorize>>[0],
        );
        if (!allowed) {
          throw new ForbiddenError(
            'You do not have permission to perform this action.',
          );
        }
      }
    },
  };
}

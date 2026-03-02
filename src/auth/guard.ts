import type { FastifyRequest, RouteOptions } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
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

/** Configuration for creating a domain-specific withAuth guard. */
export interface AuthGuardConfig<
  TSession,
  TScope extends string = string,
  TRole extends string = string,
> {
  /** Extract the session from a request. Return null if unauthenticated. */
  getSession: (request: FastifyRequest) => TSession | null;
  /** Validate that the session satisfies a scope. Throw to deny. */
  validateScope?: (session: TSession, scope: TScope) => boolean;
  /** Validate that the session satisfies one of the given roles. Throw to deny. */
  validateRole?: (session: TSession, roles: TRole[]) => boolean;
  /** Derive additional scopes (e.g. roles imply Organization). */
  deriveScopes?: (scopes: TScope[], roles: TRole[]) => TScope[];
  /** Return OpenAPI security entries for the active scopes. */
  security?: (scopes: TScope[]) => Record<string, string[]>[];
  /** Return additional response schemas keyed by status code. */
  responseSchemas?: (scopes: TScope[]) => Record<number, unknown>;
}

/** Options accepted by the function returned from createWithAuth. */
export interface ConfiguredWithAuthOptions<
  TScope extends string = string,
  TRole extends string = string,
> {
  /** Scopes the route is restricted to. */
  scopes?: TScope[];
  /** Single scope shorthand (merged into scopes). */
  scope?: TScope;
  /** Roles allowed to access the route. */
  roles?: TRole[];
  /** Additional route schema to merge. */
  schema?: RouteOptions['schema'];
}

/**
 * Factory that returns a configured withAuth function for domain-specific auth.
 * The returned function builds route options with preValidation hooks and
 * OpenAPI schema entries based on the provided config.
 */
export function createWithAuth<
  TSession,
  TScope extends string = string,
  TRole extends string = string,
>(
  config: AuthGuardConfig<TSession, TScope, TRole>,
): (
  options?: ConfiguredWithAuthOptions<TScope, TRole>,
) => Partial<RouteOptions> {
  return (options?: ConfiguredWithAuthOptions<TScope, TRole>) => {
    const userSchema = options?.schema ?? {};

    // 1. Normalize scopes (merge scope + scopes)
    let scopes: TScope[] = [...(options?.scopes ?? [])];
    if (options?.scope && !scopes.includes(options.scope)) {
      scopes.push(options.scope);
    }

    const roles: TRole[] = options?.roles ?? [];

    // 2. Derive additional scopes if configured
    if (config.deriveScopes) {
      scopes = config.deriveScopes(scopes, roles);
    }

    // 3. Build preValidation hook
    const preValidation = async (request: FastifyRequest) => {
      const session = config.getSession(request);
      if (!session) {
        throw new UnauthorizedError();
      }

      // Validate each scope
      if (config.validateScope) {
        for (const scope of scopes) {
          config.validateScope(session, scope);
        }
      }

      // Validate roles
      if (roles.length > 0 && config.validateRole) {
        config.validateRole(session, roles);
      }
    };

    // 4. Build schema
    const responseSchemas: Record<string, unknown> = {
      401: AutoRef(UnauthorizedResponseSchema),
      403: AutoRef(ForbiddenResponseSchema),
    };

    // Add config-provided response schemas
    if (config.responseSchemas) {
      const additional = config.responseSchemas(scopes);
      for (const [code, schema] of Object.entries(additional)) {
        responseSchemas[code] = schema;
      }
    }

    // Merge with user-provided response schemas
    const userResponse = (userSchema as Record<string, unknown>).response as
      | Record<string, unknown>
      | undefined;
    if (userResponse) {
      Object.assign(responseSchemas, userResponse);
    }

    const schema: Record<string, unknown> = {
      ...userSchema,
      response: responseSchemas,
    };

    // Add security entries
    if (config.security) {
      schema.security = config.security(scopes);
    }

    return { schema, preValidation };
  };
}

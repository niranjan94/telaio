import type { FastifyRequest, RouteOptions } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import {
  AutoRef,
  BadRequestErrorResponseSchema,
  ForbiddenResponseSchema,
  UnauthorizedResponseSchema,
} from '../schema/index.js';
import type { AuthAdapter, GuardRole, GuardScope } from './adapter.js';

/** Module-level registered adapter for adapter-based withAuth. */
// biome-ignore lint/suspicious/noExplicitAny: adapter session type erased at runtime
let registeredAdapter: AuthAdapter<any> | null = null;

/**
 * Registers an auth adapter for use by withAuth().
 * Called automatically by buildAuthPlugin() when an adapter is provided.
 */
// biome-ignore lint/suspicious/noExplicitAny: adapter session type erased at runtime
export function registerGuardAdapter(adapter: AuthAdapter<any>): void {
  registeredAdapter = adapter;
}

/**
 * Resets the registered auth adapter to null.
 * Use in test afterEach to prevent adapter state leaking between tests.
 */
export function resetGuardAdapter(): void {
  registeredAdapter = null;
}

/** Options for the withAuth route guard. */
export interface WithAuthOptions {
  /** Scopes the route is restricted to. */
  scopes?: GuardScope[];
  /** Single scope shorthand (merged into scopes). */
  scope?: GuardScope;
  /** Roles allowed to access the route. */
  roles?: GuardRole[];
  /**
   * Custom authorization check. Receives the session, return false to deny.
   * Runs after scope/role checks.
   */
  authorize?: (session: unknown) => boolean | Promise<boolean>;
  /** Additional route schema to merge (e.g., custom headers, params). */
  schema?: RouteOptions['schema'];
}

/**
 * Returns route options with a preValidation hook that enforces authentication.
 * When an adapter with guard config is registered (via buildAuthPlugin), uses
 * adapter-specific validation. Otherwise falls back to generic scope/role checks.
 */
export function withAuth(options?: WithAuthOptions): Partial<RouteOptions> {
  const adapter = registeredAdapter;
  if (adapter?.validateScope || adapter?.validateRole) {
    return buildAdapterGuard(adapter, options);
  }
  return buildGenericGuard(options);
}

/** Builds route options using adapter-specific guard config. */
function buildAdapterGuard(
  // biome-ignore lint/suspicious/noExplicitAny: session type erased
  adapter: AuthAdapter<any>,
  options?: WithAuthOptions,
): Partial<RouteOptions> {
  const userSchema = options?.schema ?? {};

  // 1. Normalize scopes (merge scope + scopes)
  let scopes: GuardScope[] = [...(options?.scopes ?? [])];
  if (options?.scope && !scopes.includes(options.scope)) {
    scopes.push(options.scope);
  }

  const roles: GuardRole[] = options?.roles ?? [];

  // 2. Derive additional scopes if configured
  if (adapter.deriveScopes) {
    scopes = adapter.deriveScopes(scopes, roles);
  }

  // 3. Build preValidation hook
  const preValidation = async (request: FastifyRequest) => {
    const session = adapter.getSessionFromRequest
      ? adapter.getSessionFromRequest(request)
      : (request.maybeAuthSession ?? null);

    if (!session) {
      throw new UnauthorizedError();
    }

    // Validate each scope
    if (adapter.validateScope) {
      for (const scope of scopes) {
        adapter.validateScope(session, scope);
      }
    }

    // Validate roles
    if (roles.length > 0 && adapter.validateRole) {
      adapter.validateRole(session, roles);
    }

    // Custom authorize callback
    if (options?.authorize) {
      const allowed = await options.authorize(session);
      if (!allowed) {
        throw new ForbiddenError(
          'You do not have permission to perform this action.',
        );
      }
    }
  };

  // 4. Build schema
  const responseSchemas: Record<string, unknown> = {
    401: AutoRef(UnauthorizedResponseSchema),
    403: AutoRef(ForbiddenResponseSchema),
  };

  // Add adapter-provided response schemas
  if (adapter.responseSchemas) {
    const additional = adapter.responseSchemas(scopes);
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
  if (adapter.security) {
    schema.security = adapter.security(scopes);
  }

  return { schema, preValidation };
}

/** Builds route options using generic scope/role property inspection. */
function buildGenericGuard(options?: WithAuthOptions): Partial<RouteOptions> {
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

  // Normalize scopes (merge scope + scopes)
  const scopes: string[] = [...(options?.scopes ?? [])];
  if (options?.scope && !scopes.includes(options.scope)) {
    scopes.push(options.scope);
  }

  return {
    schema,
    preValidation: async (request) => {
      // 1. Ensure authenticated
      const session = request.getAuthSession();

      // 2. Check scopes (user-defined strings)
      if (scopes.length > 0) {
        // Session must have a 'scopes' or 'scope' array-like property
        const s = session as Record<string, unknown>;
        const sessionScopes = (s.scopes ?? s.scope ?? []) as unknown[];
        const sessionScopeSet = new Set(
          Array.isArray(sessionScopes) ? sessionScopes : [sessionScopes],
        );

        const hasScope = scopes.some((sc) => sessionScopeSet.has(sc));
        if (!hasScope) {
          throw new ForbiddenError(
            'You do not have the required scope for this action.',
          );
        }
      }

      // 3. Check roles (user-defined strings)
      const roles = options?.roles ?? [];
      if (roles.length > 0) {
        // Session must have a 'role' property (possibly nested)
        const s = session as Record<string, unknown>;
        const member = s.member as Record<string, unknown> | undefined;
        const org = s.organization as Record<string, unknown> | undefined;
        const orgMember = org?.member as Record<string, unknown> | undefined;
        const role = (s.role ?? member?.role ?? orgMember?.role) as
          | string
          | undefined;

        if (!role || !roles.includes(role)) {
          throw new ForbiddenError(
            'You do not have the required role for this action.',
          );
        }
      }

      // 4. Custom authorize callback
      if (options?.authorize) {
        const allowed = await options.authorize(session);
        if (!allowed) {
          throw new ForbiddenError(
            'You do not have permission to perform this action.',
          );
        }
      }
    },
  };
}

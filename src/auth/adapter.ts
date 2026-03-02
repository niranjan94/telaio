import type { FastifyRequest } from 'fastify';

/**
 * Module augmentation interface for typing scope and role enums.
 * Consumers declare their types by augmenting this interface:
 *
 * ```ts
 * declare module 'telaio/auth' {
 *   interface AuthGuardTypes {
 *     scope: MyApiScope;
 *     role: MyRole;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by consumers
export interface AuthGuardTypes {}

/** Resolved scope type: consumer-provided or defaults to string. */
export type GuardScope = AuthGuardTypes extends { scope: infer S }
  ? S
  : string;

/** Resolved role type: consumer-provided or defaults to string. */
export type GuardRole = AuthGuardTypes extends { role: infer R }
  ? R
  : string;

/**
 * Contract that any auth library must implement to integrate with telaio.
 * TSession is the session shape that gets attached to requests.
 *
 * Guard config properties (validateScope, validateRole, etc.) are optional.
 * When present, withAuth() uses them instead of generic property inspection.
 */
export interface AuthAdapter<TSession> {
  /**
   * Extract session from request headers. Return null if not authenticated.
   * Called on every request during the onRequest hook.
   */
  getSession(headers: Headers): Promise<TSession | null>;

  /**
   * Handle auth-related routes (e.g., /auth/*).
   * If provided, telaio registers a catch-all route that delegates to this handler.
   */
  handler?: (request: Request) => Promise<Response>;

  /** Base path for auth routes. Defaults to '/auth'. */
  basePath?: string;

  /** Paths to skip session hydration for (e.g., '/auth/sign-out'). */
  skipPaths?: string[];

  /** Error redirect URL for auth errors (e.g., frontend error page). */
  errorRedirectUrl?: string;

  // -- Guard config (optional, enables adapter-based withAuth) --

  /** Extract session from a FastifyRequest. Defaults to req.maybeAuthSession. */
  getSessionFromRequest?: (request: FastifyRequest) => TSession | null;

  /** Validate that the session satisfies a scope. Throw to deny. */
  validateScope?: (
    session: TSession,
    scope: GuardScope,
  ) => boolean;

  /** Validate that the session satisfies one of the given roles. Throw to deny. */
  validateRole?: (
    session: TSession,
    roles: GuardRole[],
  ) => boolean;

  /** Derive additional scopes (e.g. roles imply Organization). */
  deriveScopes?: (
    scopes: GuardScope[],
    roles: GuardRole[],
  ) => GuardScope[];

  /** Return OpenAPI security entries for the active scopes. */
  security?: (
    scopes: GuardScope[],
  ) => Record<string, string[]>[];

  /** Return additional response schemas keyed by status code. */
  responseSchemas?: (
    scopes: GuardScope[],
  ) => Record<number, unknown>;
}

/**
 * Module augmentation interface for typing the session.
 * Users declare their session type by augmenting this interface:
 *
 * ```ts
 * declare module 'telaio/auth' {
 *   interface SessionType {
 *     session: MyAuthSession;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by consumers
export interface SessionType {}

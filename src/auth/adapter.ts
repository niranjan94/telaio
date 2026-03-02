/**
 * Contract that any auth library must implement to integrate with telaio.
 * TSession is the session shape that gets attached to requests.
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

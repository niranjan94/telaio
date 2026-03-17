import type { SessionType } from '../auth/adapter.js';

/**
 * Resolved session type from the consumer's SessionType augmentation.
 * Falls back to `unknown` when no augmentation is provided.
 */
type ResolvedSession = SessionType extends { session: infer S } ? S : unknown;

/**
 * Augments Fastify's request interface with telaio's standard decorators.
 * The auth session type is derived from the SessionType interface pattern:
 *
 * ```ts
 * declare module 'telaio/auth' {
 *   interface SessionType {
 *     session: MyAuthSession;
 *   }
 * }
 * ```
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** Auth session if available, null if not authenticated. */
    maybeAuthSession: ResolvedSession | null;
    /** Request start timestamp (epoch ms). */
    startTime?: number;
    /** Tracked temp file paths for automatic cleanup. */
    tempFiles?: string[];

    /** Get the authenticated session or throw UnauthorizedError. */
    readonly getAuthSession: () => ResolvedSession;
    /** Check if an auth session exists on this request. */
    readonly hasAuthSession: () => boolean;
    /** Add a temp file path for cleanup after response. */
    readonly addTempFile: (filePath: string) => void;
    /** Create a temp file and track it for cleanup. Returns the file path. */
    readonly getTempFile: (options?: { extension?: string }) => string;
  }
}

/**
 * Augments Fastify's request interface with telaio's standard decorators.
 * The auth session type is generic via the SessionType interface pattern.
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** Auth session if available, null if not authenticated. */
    maybeAuthSession: unknown | null;
    /** Request start timestamp (epoch ms). */
    startTime?: number;
    /** Tracked temp file paths for automatic cleanup. */
    tempFiles?: string[];

    /** Get the authenticated session or throw UnauthorizedError. */
    readonly getAuthSession: () => unknown;
    /** Check if an auth session exists on this request. */
    readonly hasAuthSession: () => boolean;
    /** Add a temp file path for cleanup after response. */
    readonly addTempFile: (filePath: string) => void;
    /** Create a temp file and track it for cleanup. Returns the file path. */
    readonly getTempFile: (options?: { extension?: string }) => string;
  }
}

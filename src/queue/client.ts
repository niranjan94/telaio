import type { Logger } from 'pino';

/**
 * Options for creating a pg-boss instance.
 * Accepts either a connection string or a config object with DATABASE_URL.
 */
export interface QueueClientOptions {
  /** PostgreSQL connection string. */
  connectionString?: string;
  /** Schema name for pg-boss tables. Defaults to 'pgboss'. */
  schema?: string;
}

/** Resolves queue options from either direct options or a config-style object. */
function resolveOptions(
  options: QueueClientOptions | Record<string, unknown>,
): { connectionString: string; schema: string } {
  const connectionString =
    (options as QueueClientOptions).connectionString ??
    (options as Record<string, unknown>).DATABASE_URL;

  if (!connectionString || typeof connectionString !== 'string') {
    throw new Error(
      'telaio: queue requires a connectionString or DATABASE_URL in config.',
    );
  }

  return {
    connectionString,
    schema: (options as QueueClientOptions).schema ?? 'pgboss',
  };
}

// biome-ignore lint/suspicious/noExplicitAny: pg-boss instance from dynamic import
let bossInstance: any | null = null;
// biome-ignore lint/suspicious/noExplicitAny: promise wrapping pg-boss instance
let startPromise: Promise<any> | null = null;

/**
 * Returns the shared pg-boss instance, creating and starting it on first call.
 * Subsequent calls return the same started instance. Safe to call concurrently —
 * the start promise is cached to prevent duplicate initialization.
 */
export async function getBoss(
  options: QueueClientOptions | Record<string, unknown>,
  logger?: Logger,
  // biome-ignore lint/suspicious/noExplicitAny: return type is PgBoss from dynamic import
): Promise<any> {
  if (bossInstance) return bossInstance;

  if (!startPromise) {
    startPromise = (async () => {
      let pgBossModule: Record<string, unknown>;
      try {
        pgBossModule = await import('pg-boss');
      } catch {
        throw new Error(
          "telaio: queue requires 'pg-boss' to be installed. Run: pnpm add pg-boss",
        );
      }

      const resolved = resolveOptions(options);
      const queueLogger = logger?.child({ module: 'queue' });

      // pg-boss exports { PgBoss } as named export
      const PgBossClass =
        (pgBossModule.PgBoss as new (
          opts: Record<string, unknown>,
        ) => Record<string, unknown>) ??
        (pgBossModule.default as new (
          opts: Record<string, unknown>,
        ) => Record<string, unknown>);

      if (!PgBossClass) {
        throw new Error(
          'telaio: could not find PgBoss constructor in pg-boss module.',
        );
      }

      const instance = new PgBossClass(resolved);

      if (typeof instance.on === 'function') {
        instance.on('error', (err: Error) =>
          queueLogger?.error({ err }, 'pg-boss error'),
        );
      }

      if (typeof instance.start === 'function') {
        await (instance.start as () => Promise<unknown>)();
      }

      queueLogger?.info('pg-boss started');
      bossInstance = instance;
      return instance;
    })();
  }

  return startPromise;
}

/**
 * Gracefully stops the pg-boss instance, allowing in-flight jobs up to 30 seconds
 * to complete before forcing shutdown.
 */
export async function stopBoss(logger?: Logger): Promise<void> {
  if (!bossInstance) return;
  const queueLogger = logger?.child({ module: 'queue' });
  await bossInstance.stop({ graceful: true, timeout: 30_000 });
  queueLogger?.info('pg-boss stopped');
  bossInstance = null;
  startPromise = null;
}

/** Resets the internal singleton state. For testing only. */
export function _resetBoss(): void {
  bossInstance = null;
  startPromise = null;
}

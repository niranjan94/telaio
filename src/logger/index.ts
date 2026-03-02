import {
  type Logger,
  pino,
  stdSerializers,
  type TransportSingleOptions,
} from 'pino';

export type { Logger } from 'pino';

export interface LoggerOptions {
  /** Log level. Defaults to 'info'. */
  level?: string;
  /** Override transport configuration (e.g., custom pino-pretty options). */
  transport?: TransportSingleOptions;
  /** Whether to attempt using pino-pretty in dev. Defaults to true. */
  pretty?: boolean;
}

/**
 * Creates a Pino logger instance with sensible defaults.
 * Automatically uses pino-pretty if available and pretty is not disabled.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = 'info', transport, pretty = true } = options;

  let resolvedTransport: TransportSingleOptions | undefined = transport;

  if (!resolvedTransport && pretty) {
    try {
      import.meta.resolve('pino-pretty');
      resolvedTransport = {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      };
    } catch {
      // pino-pretty not installed, use default JSON output
    }
  }

  return pino({
    level,
    transport: resolvedTransport,
    serializers: {
      err: stdSerializers.err,
      error: stdSerializers.err,
      e: stdSerializers.err,
    },
  });
}

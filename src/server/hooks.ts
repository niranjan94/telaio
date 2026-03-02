import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { ErrorCode, RequestError, UnauthorizedError } from '../errors/index.js';

/** Paths excluded from request completion logging. */
const LOGGING_IGNORED_PATHS = ['/healthz', '/healthz?extended=true'];

/**
 * Registers request lifecycle hooks, decorators, error handler, and health endpoint.
 * Call with ephemeral=true to skip hooks (used for client generation).
 */
export async function registerHooks(
  server: FastifyInstance,
  options: {
    logger: Logger;
    onReady?: () => Promise<void>;
    onClose?: () => Promise<void>;
  },
) {
  const { logger, onReady, onClose } = options;

  server.decorateRequest('startTime', undefined);
  server.decorateRequest('maybeAuthSession', null);

  server.decorateRequest(
    'getAuthSession',
    function () {
      if (!this.maybeAuthSession) {
        throw new UnauthorizedError();
      }
      return this.maybeAuthSession;
    },
    ['maybeAuthSession'],
  );

  server.decorateRequest('hasAuthSession', function () {
    return !!this.maybeAuthSession;
  });

  server.setErrorHandler(
    (error: FastifyError | RequestError | Error, request, reply) => {
      if (error instanceof RequestError) {
        reply.status(error.statusCode).send(error.toJSON());
        return;
      }

      // Handle Kysely NoResultError if available
      if (error.constructor?.name === 'NoResultError') {
        logger.error({ error }, 'uncaught not found error from db');
        reply.status(404).send({
          status: 'error',
          code: ErrorCode.NOT_FOUND,
          message: 'Not found',
        });
        return;
      }

      if ('validation' in error && error.validation) {
        reply.status(422).send({
          status: 'error',
          code: ErrorCode.UNPROCESSABLE_ENTITY,
          message: 'Validation failed',
          validation: error.validation,
          validationContext: error.validationContext,
        });
        return;
      }

      const logId = randomUUID();

      server.log.error(
        {
          logId,
          e: error,
          url: request.url,
          method: request.method,
          proposedStatus: reply.statusCode,
        },
        'unhandled error',
      );

      if ('statusCode' in error && error.statusCode && error.statusCode < 500) {
        reply.status(error.statusCode).send({
          status: 'error',
          code: ErrorCode.ERROR,
          message: error.name || 'An error occurred',
          logId,
        });
        return;
      }

      reply.status(500).send({
        status: 'error',
        code: ErrorCode.ERROR,
        message: 'An error occurred',
        logId,
      });
    },
  );

  server.addHook('onRequest', (req, _reply, done) => {
    req.startTime = dayjs().valueOf();
    done();
  });

  server.addHook('onResponse', (req, reply, done) => {
    const statusCode = reply.statusCode;

    if (
      statusCode >= 200 &&
      statusCode < 300 &&
      (!req.raw.url || LOGGING_IGNORED_PATHS.includes(req.raw.url))
    ) {
      done();
      return;
    }

    const currentTime = dayjs().valueOf();
    const startTime = req.startTime || currentTime;

    const requestLogger = req.log.child({
      ip: req.ip,
      method: req.method,
      url: req.raw.url,
      statusCode: reply.statusCode,
      durationMs: currentTime - startTime,
    });

    requestLogger.info('request completed');
    done();
  });

  if (onReady) {
    server.addHook('onReady', onReady);
  }
  if (onClose) {
    server.addHook('onClose', onClose);
  }

  server.get('/healthz', async () => {
    return { status: 'ok' };
  });
}

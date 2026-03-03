import type { FastifyInstance } from 'fastify';
import { withAuth } from 'telaio/auth';
import { AutoRef } from 'telaio/schema';
import {
  type PingResponse,
  PingResponseSchema,
} from '../../../schemas/ping.js';

export default async function (app: FastifyInstance) {
  app.get<{ Reply: PingResponse }>(
    '',
    withAuth({
      schema: {
        operationId: 'ping',
        tags: ['debug'],
        description: 'Ping the server to check connectivity and auth.',
        response: { 200: AutoRef(PingResponseSchema) },
      },
    }),
    async () => {
      return { pong: true, timestamp: new Date().toISOString() };
    },
  );
}

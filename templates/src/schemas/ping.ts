import { type Static, Type } from 'typebox';

export const PingResponseSchema = Type.Object(
  {
    pong: Type.Boolean(),
    timestamp: Type.String({ format: 'date-time' }),
  },
  { $id: 'PingResponse' },
);

export type PingResponse = Static<typeof PingResponseSchema>;

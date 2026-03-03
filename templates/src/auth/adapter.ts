import type { Session, User } from 'better-auth';
import type { AuthAdapter } from 'telaio/auth';
import { auth } from './client.js';

export type AuthSession = Session & { user: User };

export const authAdapter: AuthAdapter<AuthSession> = {
  async getSession(headers) {
    const session = await auth.api.getSession({ headers });
    return session ?? null;
  },
  handler: auth.handler,
  basePath: '/auth',
};

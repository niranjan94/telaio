import type { Session, User } from 'better-auth';

export type { Session, User } from 'better-auth';

export type OrganizationRole = 'member' | 'admin' | 'owner';

/** Basic session: user + session data. */
export type BetterAuthSession = Session & { user: User };

/** Organization-aware session: user + session + org context. */
export type BetterAuthOrgSession = BetterAuthSession & {
  organization: {
    id: string;
    member: {
      id: string;
      role: string;
    };
  };
};

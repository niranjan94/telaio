import type { Cache } from '../../cache/index.js';

/**
 * Spread into betterAuth() to map core tables to snake_case columns.
 * Required because telaio uses CamelCasePlugin (snake_case in Postgres, camelCase in TypeScript),
 * but better-auth has its own query layer that needs explicit column name mappings.
 */
export const snakeCaseSchema = {
  user: {
    modelName: 'users',
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  account: {
    modelName: 'accounts',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: {
    modelName: 'verifications',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  session: {
    modelName: 'sessions',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
      activeOrganizationId: 'active_organization_id',
    },
  },
} as const;

/** Spread into organization() plugin to map org tables to snake_case columns. */
export const orgSchemaMap = {
  schema: {
    organization: {
      modelName: 'organizations',
      fields: { createdAt: 'created_at' },
    },
    member: {
      modelName: 'members',
      fields: {
        organizationId: 'organization_id',
        userId: 'user_id',
        createdAt: 'created_at',
      },
    },
    invitation: {
      modelName: 'invitations',
      fields: {
        organizationId: 'organization_id',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        inviterId: 'inviter_id',
      },
    },
  },
} as const;

/** Config shape expected by socialProviders(). Matches betterAuthConfigSchema fields. */
interface SocialProviderConfig {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}

/**
 * Builds social provider config from env vars.
 * Returns undefined for providers without credentials (better-auth ignores undefined entries).
 */
export function socialProviders(config: SocialProviderConfig) {
  return {
    google:
      config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account' as const,
          }
        : undefined,
    github:
      config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
        ? {
            clientId: config.GITHUB_CLIENT_ID,
            clientSecret: config.GITHUB_CLIENT_SECRET,
          }
        : undefined,
    microsoft:
      config.MICROSOFT_CLIENT_ID && config.MICROSOFT_CLIENT_SECRET
        ? {
            clientId: config.MICROSOFT_CLIENT_ID,
            clientSecret: config.MICROSOFT_CLIENT_SECRET,
            tenantId: 'common',
            authority: 'https://login.microsoftonline.com',
            prompt: 'select_account' as const,
            mapProfileToUser(user: { tid?: string }) {
              return {
                emailVerified:
                  user.tid !== '9188040d-6c67-4c5b-b112-36a304b66dad',
              };
            },
          }
        : undefined,
  };
}

/**
 * Wraps telaio's Cache for better-auth secondary storage (rate limiting, session caching).
 * Returns undefined when cache is unavailable, letting better-auth fall back to defaults.
 */
export function redisSecondaryStorage(cache?: Cache | null) {
  if (!cache?.redis) return undefined;
  return {
    get: (key: string) => cache.get(`auth-${key}`),
    set: (key: string, value: string, ttl?: number) =>
      cache.set(`auth-${key}`, value, ttl),
    delete: (key: string) => cache.delete(`auth-${key}`),
  };
}

/** Minimal Pool interface for org session hooks (avoids hard dep on pg types). */
interface PoolLike {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Options for orgSessionHooks(). */
export interface OrgSessionHookOptions {
  /** pg Pool for querying members/users tables directly. */
  pool: PoolLike;
  /** Lazy getter for the auth instance (resolves circular ref with betterAuth() call). */
  getAuth: () => {
    api: {
      createOrganization(opts: {
        body: Record<string, unknown>;
      }): Promise<{ id: string } | null>;
    };
  };
  /** Custom slug generator. Receives user name, returns slug. Default: name-slugified + 8-char random suffix. */
  generateSlug?: (name: string) => string;
}

/**
 * Auto-assigns users to their most recent org (or creates a new one) on session creation.
 * Uses raw pg Pool queries (not Kysely) to avoid type dependency on the user's DB schema.
 */
export function orgSessionHooks(options: OrgSessionHookOptions) {
  return {
    session: {
      create: {
        before: async (
          session: Record<string, unknown> & { userId: string },
        ) => {
          const { pool, getAuth, generateSlug } = options;

          // 1. Find user's most recent org membership
          const memberResult = await pool.query(
            'SELECT organization_id FROM members WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [session.userId],
          );
          let organizationId = memberResult.rows[0]?.organization_id as
            | string
            | undefined;

          // 2. If no membership, create a default organization
          if (!organizationId) {
            const userResult = await pool.query(
              'SELECT name FROM users WHERE id = $1',
              [session.userId],
            );
            const userName = userResult.rows[0]?.name as string | undefined;
            if (!userName) throw new Error('User not found');

            const slug = generateSlug
              ? generateSlug(userName)
              : `${userName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 8)}`;

            const org = await getAuth().api.createOrganization({
              body: {
                name: userName,
                slug,
                userId: session.userId,
                keepCurrentActiveOrganization: false,
              },
            });
            if (!org) throw new Error('Organization creation failed');
            organizationId = org.id;
          }

          // 3. Attach org to session
          return {
            data: { ...session, activeOrganizationId: organizationId },
          };
        },
      },
    },
  };
}

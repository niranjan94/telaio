import { z } from 'zod';
import { csvString } from '../../config/schemas.js';

/** Zod schema for better-auth environment variables. Extend with app-specific vars. */
export const betterAuthConfigSchema = z.object({
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.url().optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: csvString.default([]),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
});

export type BetterAuthEnvConfig = z.infer<typeof betterAuthConfigSchema>;

import { z } from 'zod';

/**
 * Coerces env var strings to boolean.
 * Treats 'false', '0', and '' as false; everything else as true.
 */
export const envBoolean = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string')
    return !['false', '0', ''].includes(val.toLowerCase());
  return Boolean(val);
}, z.boolean());

/** Transforms a comma-separated env var string into a trimmed string array. */
export const csvString = z.preprocess((val) => {
  if (typeof val !== 'string' || val === '') return [];
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}, z.array(z.string()));

/** Core config present in every telaio app. */
export const coreConfigSchema = z.object({
  APP_NAME: z.string().default('App'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  BASE_DIR: z.string().default(process.cwd()),
});

/** Server-related config for the Fastify HTTP server. */
export const serverConfigSchema = z.object({
  API_URL: z.url().default('http://localhost:4001'),
  API_LISTEN_PORT: z.coerce.number().default(4001),
  API_LISTEN_ADDRESS: z.string().default('0.0.0.0'),
  CORS_ORIGINS: csvString.default([]),
  WHITELIST_PROXIES: csvString.default([]),
  ENABLE_API_DOCS: envBoolean.default(false),
});

/** Database config for PostgreSQL via Kysely. */
export const databaseConfigSchema = z.object({
  DATABASE_URL: z.url().default('postgresql://localhost/app'),
  DATABASE_SSL: envBoolean.optional(),
});

/** Redis cache config. */
export const cacheConfigSchema = z.object({
  REDIS_ENABLED: envBoolean.default(true),
  REDIS_URL: z.url().optional(),
});

/** Queue config for pg-boss. */
export const queueConfigSchema = z.object({
  QUEUE_SCHEMA: z.string().default('pgboss'),
});

/** S3 config for AWS S3 client. */
export const s3ConfigSchema = z.object({
  AWS_S3_REGION: z
    .string()
    .default(
      process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    ),
  AWS_S3_BUCKET_NAME: z.string().default('assets'),
  AWS_S3_ENDPOINT: z.string().optional(),
  AWS_S3_ACCESS_KEY_ID: z.string().optional(),
  AWS_S3_SECRET_ACCESS_KEY: z.string().optional(),
});

/** Email config for AWS SES. */
export const emailConfigSchema = z.object({
  AWS_SES_REGION: z.string().default('us-east-1'),
  EMAIL_FROM: z.string().default('noreply@example.com'),
});

export type CoreConfig = z.infer<typeof coreConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type CacheConfig = z.infer<typeof cacheConfigSchema>;
export type QueueConfig = z.infer<typeof queueConfigSchema>;
export type S3Config = z.infer<typeof s3ConfigSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;

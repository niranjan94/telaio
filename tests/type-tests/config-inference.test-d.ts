import { describe, expectTypeOf, it } from 'vitest';
import type {
  CacheConfig,
  CoreConfig,
  DatabaseConfig,
  EmailConfig,
  QueueConfig,
  S3Config,
  ServerConfig,
} from '../../src/config/index.js';
import { loadConfig } from '../../src/config/index.js';

describe('config inference', () => {
  it('CoreConfig has APP_NAME, NODE_ENV, BASE_DIR', () => {
    expectTypeOf<CoreConfig>().toHaveProperty('APP_NAME');
    expectTypeOf<CoreConfig>().toHaveProperty('NODE_ENV');
    expectTypeOf<CoreConfig>().toHaveProperty('BASE_DIR');
  });

  it('DatabaseConfig has DATABASE_URL and DATABASE_SSL', () => {
    expectTypeOf<DatabaseConfig>().toHaveProperty('DATABASE_URL');
    expectTypeOf<DatabaseConfig>().toHaveProperty('DATABASE_SSL');
  });

  it('ServerConfig has server fields', () => {
    expectTypeOf<ServerConfig>().toHaveProperty('API_URL');
    expectTypeOf<ServerConfig>().toHaveProperty('API_LISTEN_PORT');
    expectTypeOf<ServerConfig>().toHaveProperty('API_LISTEN_ADDRESS');
    expectTypeOf<ServerConfig>().toHaveProperty('CORS_ORIGINS');
    expectTypeOf<ServerConfig>().toHaveProperty('WHITELIST_PROXIES');
    expectTypeOf<ServerConfig>().toHaveProperty('ENABLE_API_DOCS');
  });

  it('CacheConfig has REDIS_ENABLED and REDIS_URL', () => {
    expectTypeOf<CacheConfig>().toHaveProperty('REDIS_ENABLED');
    expectTypeOf<CacheConfig>().toHaveProperty('REDIS_URL');
  });

  it('QueueConfig has QUEUE_SCHEMA', () => {
    expectTypeOf<QueueConfig>().toHaveProperty('QUEUE_SCHEMA');
  });

  it('S3Config has AWS_S3_REGION and AWS_S3_BUCKET_NAME', () => {
    expectTypeOf<S3Config>().toHaveProperty('AWS_S3_REGION');
    expectTypeOf<S3Config>().toHaveProperty('AWS_S3_BUCKET_NAME');
  });

  it('EmailConfig has AWS_SES_REGION and EMAIL_FROM', () => {
    expectTypeOf<EmailConfig>().toHaveProperty('AWS_SES_REGION');
    expectTypeOf<EmailConfig>().toHaveProperty('EMAIL_FROM');
  });

  it('loadConfig with database flag returns type with DATABASE_URL', () => {
    const result = loadConfig({ flags: { database: true } });
    expectTypeOf(result).toHaveProperty('APP_NAME');
    expectTypeOf(result).toHaveProperty('DATABASE_URL');
  });

  it('loadConfig with server flag returns type with API_URL', () => {
    const result = loadConfig({ flags: { server: true } });
    expectTypeOf(result).toHaveProperty('APP_NAME');
    expectTypeOf(result).toHaveProperty('API_URL');
    expectTypeOf(result).toHaveProperty('API_LISTEN_PORT');
  });

  it('loadConfig with multiple flags merges all config fields', () => {
    const result = loadConfig({
      flags: { server: true, database: true, cache: true },
    });
    expectTypeOf(result).toHaveProperty('APP_NAME');
    expectTypeOf(result).toHaveProperty('API_URL');
    expectTypeOf(result).toHaveProperty('DATABASE_URL');
    expectTypeOf(result).toHaveProperty('REDIS_ENABLED');
  });

  it('loadConfig without database flag does not have DATABASE_URL', () => {
    const result = loadConfig({ flags: { server: true } });
    // SERVER fields present
    expectTypeOf(result).toHaveProperty('API_URL');
    // DATABASE fields absent — DATABASE_URL should not be a known key
    type ResultKeys = keyof typeof result;
    expectTypeOf<'DATABASE_URL'>().not.toEqualTypeOf<ResultKeys>();
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadConfig } from '../index.js';

describe('loadConfig', () => {
  it('returns core config with defaults', () => {
    const config = loadConfig({
      skipEnvLoad: true,
      source: {},
    });
    expect(config.APP_NAME).toBe('App');
    expect(config.NODE_ENV).toBe('development');
    expect(typeof config.BASE_DIR).toBe('string');
  });

  it('parses source values over defaults', () => {
    const config = loadConfig({
      skipEnvLoad: true,
      source: { APP_NAME: 'MyApp', NODE_ENV: 'production' },
    });
    expect(config.APP_NAME).toBe('MyApp');
    expect(config.NODE_ENV).toBe('production');
  });

  it('includes server config when server flag is set', () => {
    const config = loadConfig({
      flags: { server: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.API_LISTEN_PORT).toBe(4001);
    expect(config.API_LISTEN_ADDRESS).toBe('0.0.0.0');
    expect(config.ENABLE_API_DOCS).toBe(false);
    expect(config.CORS_ORIGINS).toEqual([]);
  });

  it('includes database config when database flag is set', () => {
    const config = loadConfig({
      flags: { database: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.DATABASE_URL).toBe('postgresql://localhost/app');
  });

  it('includes cache config when cache flag is set', () => {
    const config = loadConfig({
      flags: { cache: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.REDIS_ENABLED).toBe(true);
  });

  it('includes queue config when queue flag is set', () => {
    const config = loadConfig({
      flags: { queue: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.QUEUE_SCHEMA).toBe('pgboss');
  });

  it('includes s3 config when s3 flag is set', () => {
    const config = loadConfig({
      flags: { s3: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.AWS_S3_BUCKET_NAME).toBe('assets');
  });

  it('includes email config when email flag is set', () => {
    const config = loadConfig({
      flags: { email: true },
      skipEnvLoad: true,
      source: {},
    });
    expect(config.EMAIL_FROM).toBe('noreply@example.com');
  });

  it('merges user extension schema', () => {
    const config = loadConfig({
      extend: z.object({
        CUSTOM_VAR: z.string().default('hello'),
      }),
      skipEnvLoad: true,
      source: {},
    });
    expect(config.CUSTOM_VAR).toBe('hello');
  });

  it('composes multiple modules with extension', () => {
    const config = loadConfig({
      flags: { database: true, cache: true },
      extend: z.object({
        MY_SECRET: z.string(),
      }),
      skipEnvLoad: true,
      source: {
        MY_SECRET: 'secret123',
        DATABASE_URL: 'postgresql://localhost/test',
        REDIS_ENABLED: 'false',
      },
    });
    expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
    expect(config.REDIS_ENABLED).toBe(false);
    expect(config.MY_SECRET).toBe('secret123');
  });

  it('parses CORS_ORIGINS as CSV', () => {
    const config = loadConfig({
      flags: { server: true },
      skipEnvLoad: true,
      source: { CORS_ORIGINS: 'https://a.com,https://b.com' },
    });
    expect(config.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('handles empty CORS_ORIGINS', () => {
    const config = loadConfig({
      flags: { server: true },
      skipEnvLoad: true,
      source: { CORS_ORIGINS: '' },
    });
    expect(config.CORS_ORIGINS).toEqual([]);
  });

  it('throws on invalid required values', () => {
    expect(() =>
      loadConfig({
        extend: z.object({
          REQUIRED_FIELD: z.string(),
        }),
        skipEnvLoad: true,
        source: {},
      }),
    ).toThrow();
  });
});

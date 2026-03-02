import { describe, expect, it } from 'vitest';
import { createLogger } from '../../logger/index.js';
import { Cache, createCache } from '../index.js';

const logger = createLogger({ level: 'silent', pretty: false });

describe('Cache', () => {
  it('creates a disabled cache when enabled is false', () => {
    const cache = new Cache({ enabled: false, logger });
    expect(cache.redis).toBeNull();
  });

  it('get returns null when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    const result = await cache.get('anything');
    expect(result).toBeNull();
  });

  it('set is a no-op when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    // Should not throw
    await cache.set('key', 'value', 60);
  });

  it('delete is a no-op when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    await cache.delete('key');
  });

  it('getRecord returns null when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    const result = await cache.getRecord('key');
    expect(result).toBeNull();
  });

  it('setRecord is a no-op when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    await cache.setRecord('key', { foo: 'bar' }, 60);
  });

  it('close is a no-op when disabled', async () => {
    const cache = new Cache({ enabled: false, logger });
    await cache.close();
  });
});

describe('createCache', () => {
  it('creates a disabled cache from direct options', () => {
    const cache = createCache({ enabled: false }, logger);
    expect(cache).toBeInstanceOf(Cache);
    expect(cache.redis).toBeNull();
  });

  it('creates a disabled cache from config-style object', () => {
    const cache = createCache({ REDIS_ENABLED: false }, logger);
    expect(cache).toBeInstanceOf(Cache);
    expect(cache.redis).toBeNull();
  });

  it('creates a cache with defaults when no options provided', () => {
    // This will try to connect to Redis, which may fail in CI
    // But the Cache object should still be created
    const cache = createCache(undefined, logger);
    expect(cache).toBeInstanceOf(Cache);
  });
});

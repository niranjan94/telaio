import { describe, expect, it } from 'vitest';
import { transformToHeaders } from '../plugin.js';

describe('transformToHeaders', () => {
  it('converts plain string headers', () => {
    const headers = transformToHeaders({
      'content-type': 'application/json',
      authorization: 'Bearer token123',
    });
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer token123');
  });

  it('handles array headers by appending', () => {
    const headers = transformToHeaders({
      'set-cookie': ['a=1', 'b=2'],
    });
    // Headers.getAll may not exist, but get returns comma-joined
    expect(headers.get('set-cookie')).toContain('a=1');
    expect(headers.get('set-cookie')).toContain('b=2');
  });

  it('skips undefined values', () => {
    const headers = transformToHeaders({
      present: 'yes',
      absent: undefined,
    });
    expect(headers.get('present')).toBe('yes');
    expect(headers.get('absent')).toBeNull();
  });

  it('returns empty Headers for empty input', () => {
    const headers = transformToHeaders({});
    expect([...headers.entries()]).toHaveLength(0);
  });
});

describe('auth module exports', () => {
  it('exports AuthAdapter type and withAuth function', async () => {
    const mod = await import('../index.js');
    expect(mod.withAuth).toBeDefined();
    expect(typeof mod.withAuth).toBe('function');
    expect(mod.buildAuthPlugin).toBeDefined();
    expect(typeof mod.buildAuthPlugin).toBe('function');
    expect(mod.transformToHeaders).toBeDefined();
  });
});

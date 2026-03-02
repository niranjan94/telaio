import { describe, expect, it } from 'vitest';

describe('dynamic-filters', () => {
  it('module exports applyFilter', async () => {
    const mod = await import('../query-builders/dynamic-filters.js');
    expect(mod.applyFilter).toBeDefined();
    expect(typeof mod.applyFilter).toBe('function');
  });
});

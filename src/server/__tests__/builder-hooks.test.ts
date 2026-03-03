import { describe, expect, it, vi } from 'vitest';
import { AppBuilder } from '../../builder.js';

describe('AppBuilder onReady/onClose', () => {
  it('calls multiple onReady callbacks in registration order', async () => {
    const calls: string[] = [];
    const builder = new AppBuilder()
      .onReady(async () => {
        calls.push('first');
      })
      .onReady(async () => {
        calls.push('second');
      });

    // Access private field for testing
    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onReady as Array<() => Promise<void>>;
    expect(hooks).toHaveLength(2);
    for (const fn of hooks) await fn();
    expect(calls).toEqual(['first', 'second']);
  });

  it('calls multiple onClose callbacks in registration order', async () => {
    const calls: string[] = [];
    const builder = new AppBuilder()
      .onClose(async () => {
        calls.push('first');
      })
      .onClose(async () => {
        calls.push('second');
      });

    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onClose as Array<() => Promise<void>>;
    expect(hooks).toHaveLength(2);
    for (const fn of hooks) await fn();
    expect(calls).toEqual(['first', 'second']);
  });

  it('does not overwrite first callback when second is added', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const builder = new AppBuilder().onReady(fn1).onReady(fn2);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onReady;
    expect(hooks).toContain(fn1);
    expect(hooks).toContain(fn2);
  });
});

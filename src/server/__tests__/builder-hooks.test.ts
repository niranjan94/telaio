import { describe, expect, it, vi } from 'vitest';
import { AppBuilder } from '../../builder.js';

describe('AppBuilder onStart/onStop', () => {
  it('calls multiple onStart callbacks in registration order', async () => {
    const calls: string[] = [];
    const builder = new AppBuilder()
      .onStart(async () => {
        calls.push('first');
      })
      .onStart(async () => {
        calls.push('second');
      });

    // Access private field for testing
    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onStart as Array<() => Promise<void>>;
    expect(hooks).toHaveLength(2);
    for (const fn of hooks) await fn();
    expect(calls).toEqual(['first', 'second']);
  });

  it('calls multiple onStop callbacks in registration order', async () => {
    const calls: string[] = [];
    const builder = new AppBuilder()
      .onStop(async () => {
        calls.push('first');
      })
      .onStop(async () => {
        calls.push('second');
      });

    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onStop as Array<() => Promise<void>>;
    expect(hooks).toHaveLength(2);
    for (const fn of hooks) await fn();
    expect(calls).toEqual(['first', 'second']);
  });

  it('does not overwrite first callback when second is added', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const builder = new AppBuilder().onStart(fn1).onStart(fn2);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private field in test
    const hooks = (builder as any)._onStart;
    expect(hooks).toContain(fn1);
    expect(hooks).toContain(fn2);
  });
});

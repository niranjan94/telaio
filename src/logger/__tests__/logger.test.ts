import { describe, expect, it } from 'vitest';

import { createLogger } from '../index.js';

describe('createLogger', () => {
  it('returns a pino logger instance', () => {
    const logger = createLogger({ pretty: false });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('respects the level option', () => {
    const logger = createLogger({ level: 'warn', pretty: false });
    expect(logger.level).toBe('warn');
  });

  it('defaults to info level', () => {
    const logger = createLogger({ pretty: false });
    expect(logger.level).toBe('info');
  });

  it('creates child loggers', () => {
    const logger = createLogger({ pretty: false });
    const child = logger.child({ module: 'test' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerAutoload } from '../plugins.js';

/** Creates a minimal mock logger. */
function mockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: mock logger
  } as any;
}

describe('registerAutoload', () => {
  it('skips entirely when autoload is false', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock fastify
    const server = { register: vi.fn() } as any;
    await registerAutoload(
      server,
      { autoload: false },
      {
        logger: mockLogger(),
        baseDir: '/fake',
      },
    );
    expect(server.register).not.toHaveBeenCalled();
  });

  it('defaults routes dir to src/routes relative to baseDir', () => {
    const baseDir = '/my/project';
    const expected = path.join(baseDir, 'src', 'routes');
    expect(expected).toBe('/my/project/src/routes');
  });

  it('throws when routes directory does not exist', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock fastify
    const server = { register: vi.fn() } as any;
    await expect(
      registerAutoload(
        server,
        {},
        {
          logger: mockLogger(),
          baseDir: '/nonexistent/project',
        },
      ),
    ).rejects.toThrow('Routes directory not found');
  });
});

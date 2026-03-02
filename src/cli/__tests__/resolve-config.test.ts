import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetConfigCache,
  findConfigFile,
  resolveCliConfig,
} from '../resolve-config.js';

describe('findConfigFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-resolve-'));
    // Create a minimal package.json so readTelaioConfig doesn't fail
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    _resetConfigCache();
  });

  it('discovers telaio.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.ts'),
      'export default {}',
      'utf-8',
    );
    const result = findConfigFile(tmpDir);
    expect(result).toBe(path.join(tmpDir, 'telaio.config.ts'));
  });

  it('discovers telaio.config.js', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.js'),
      'export default {}',
      'utf-8',
    );
    const result = findConfigFile(tmpDir);
    expect(result).toBe(path.join(tmpDir, 'telaio.config.js'));
  });

  it('prefers .ts over .js', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.ts'),
      'export default {}',
      'utf-8',
    );
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.js'),
      'export default {}',
      'utf-8',
    );
    const result = findConfigFile(tmpDir);
    expect(result).toBe(path.join(tmpDir, 'telaio.config.ts'));
  });

  it('uses explicit path from package.json telaio.config', async () => {
    const configPath = path.join(tmpDir, 'custom', 'my-config.ts');
    await fs.mkdir(path.join(tmpDir, 'custom'), { recursive: true });
    await fs.writeFile(configPath, 'export default {}', 'utf-8');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        telaio: { config: 'custom/my-config.ts' },
      }),
      'utf-8',
    );

    const result = findConfigFile(tmpDir);
    expect(result).toBe(configPath);
  });

  it('falls back to auto-discovery when explicit path does not exist', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.ts'),
      'export default {}',
      'utf-8',
    );
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', telaio: { config: 'nonexistent.ts' } }),
      'utf-8',
    );

    const result = findConfigFile(tmpDir);
    expect(result).toBe(path.join(tmpDir, 'telaio.config.ts'));
  });

  it('returns null when no config file exists', () => {
    const result = findConfigFile(tmpDir);
    expect(result).toBeNull();
  });
});

describe('resolveCliConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-resolve-'));
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    _resetConfigCache();
    vi.restoreAllMocks();
  });

  it('resolves a pre-resolved config object from a config file', async () => {
    // Write a config file that exports a plain object (not defineConfig)
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.mjs'),
      'export default { DATABASE_URL: "postgresql://localhost/test", NODE_ENV: "test" };',
      'utf-8',
    );

    const config = await resolveCliConfig(tmpDir);
    expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
    expect(config.NODE_ENV).toBe('test');
  });

  it('caches results per cwd', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'telaio.config.mjs'),
      'export default { DATABASE_URL: "postgresql://localhost/cached" };',
      'utf-8',
    );

    const first = await resolveCliConfig(tmpDir);
    const second = await resolveCliConfig(tmpDir);
    expect(first).toBe(second);
  });

  it('falls back to process.env when no config file exists', async () => {
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost/from-env';

    try {
      const config = await resolveCliConfig(tmpDir);
      expect(config.DATABASE_URL).toBe('postgresql://localhost/from-env');
    } finally {
      if (originalDbUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDbUrl;
      }
    }
  });
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CliMetadata } from '../../config/index.js';
import {
  discoverAppModule,
  discoverConsumerRegistry,
  discoverDevProcesses,
} from '../discover.js';

describe('discover', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-discover-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Creates a file at the given path inside tmpDir. */
  async function touch(...relativePaths: string[]): Promise<void> {
    for (const p of relativePaths) {
      const full = path.join(tmpDir, p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, '', 'utf-8');
    }
  }

  /** Writes a package.json with the given content. */
  async function writePkg(
    content: Record<string, unknown>,
  ): Promise<void> {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(content),
      'utf-8',
    );
  }

  describe('discoverAppModule', () => {
    it('returns explicit app path from metadata when file exists', async () => {
      await touch('src/api/fastify.ts');
      const result = discoverAppModule(tmpDir, { app: 'src/api/fastify.ts' });
      expect(result).toBe('src/api/fastify.ts');
    });

    it('returns null for explicit path that does not exist', () => {
      const result = discoverAppModule(tmpDir, { app: 'src/nonexistent.ts' });
      expect(result).toBeNull();
    });

    it('discovers src/api/fastify.ts by convention', async () => {
      await touch('src/api/fastify.ts');
      const result = discoverAppModule(tmpDir, {});
      expect(result).toBe('src/api/fastify.ts');
    });

    it('discovers src/app.ts by convention', async () => {
      await touch('src/app.ts');
      const result = discoverAppModule(tmpDir, {});
      expect(result).toBe('src/app.ts');
    });

    it('prefers src/api/fastify.ts over src/app.ts', async () => {
      await touch('src/api/fastify.ts', 'src/app.ts');
      const result = discoverAppModule(tmpDir, {});
      expect(result).toBe('src/api/fastify.ts');
    });

    it('returns null when no app module exists', () => {
      const result = discoverAppModule(tmpDir, {});
      expect(result).toBeNull();
    });
  });

  describe('discoverConsumerRegistry', () => {
    it('returns explicit registry path from metadata when file exists', async () => {
      await touch('src/queues/custom-registry.ts');
      const result = discoverConsumerRegistry(tmpDir, {
        consumer: { registry: 'src/queues/custom-registry.ts' },
      });
      expect(result).toBe('src/queues/custom-registry.ts');
    });

    it('returns null for explicit path that does not exist', () => {
      const result = discoverConsumerRegistry(tmpDir, {
        consumer: { registry: 'src/queues/nonexistent.ts' },
      });
      expect(result).toBeNull();
    });

    it('discovers default registry path', async () => {
      await touch('src/queues/registry/index.ts');
      const result = discoverConsumerRegistry(tmpDir, {});
      expect(result).toBe('src/queues/registry/index.ts');
    });

    it('returns null when no registry exists', () => {
      const result = discoverConsumerRegistry(tmpDir, {});
      expect(result).toBeNull();
    });
  });

  describe('discoverDevProcesses', () => {
    it('discovers all processes when all files exist', async () => {
      await touch(
        'src/api/server.ts',
        'src/api/fastify.ts',
        'src/queues/registry/index.ts',
      );
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      const names = processes.map((p) => p.name);

      expect(names).toContain('api');
      expect(names).toContain('consumer');
      expect(names).toContain('client-gen');
      expect(names).toContain('build');
    });

    it('discovers api from src/server.ts when src/api/server.ts is missing', async () => {
      await touch('src/server.ts');
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      const api = processes.find((p) => p.name === 'api');

      expect(api).toBeDefined();
      expect(api?.command).toBe('tsx src/server.ts');
    });

    it('prefers src/api/server.ts over src/server.ts', async () => {
      await touch('src/api/server.ts', 'src/server.ts');
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      const api = processes.find((p) => p.name === 'api');

      expect(api?.command).toBe('tsx src/api/server.ts');
    });

    it('skips api when no server file exists', async () => {
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      expect(processes.find((p) => p.name === 'api')).toBeUndefined();
    });

    it('skips consumer when registry does not exist', async () => {
      await touch('src/api/server.ts');
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      expect(processes.find((p) => p.name === 'consumer')).toBeUndefined();
    });

    it('skips client-gen when app module does not exist', async () => {
      await touch('src/api/server.ts');
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      expect(processes.find((p) => p.name === 'client-gen')).toBeUndefined();
    });

    it('skips client-gen when client.enabled is false', async () => {
      await touch('src/api/server.ts', 'src/api/fastify.ts');
      await writePkg({ name: 'test' });

      const metadata: CliMetadata = { client: { enabled: false } };
      const processes = discoverDevProcesses(tmpDir, metadata);

      expect(processes.find((p) => p.name === 'client-gen')).toBeUndefined();
    });

    it('always includes build process', async () => {
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      const build = processes.find((p) => p.name === 'build');

      expect(build).toBeDefined();
      expect(build?.command).toContain('tsc');
    });

    it('uses tsconfig.build.json when available', async () => {
      await touch('tsconfig.build.json');
      await writePkg({ name: 'test' });

      const processes = discoverDevProcesses(tmpDir, {});
      const build = processes.find((p) => p.name === 'build');

      expect(build?.command).toContain('-p tsconfig.build.json');
    });

    it('chains tsc-alias when available in devDependencies', async () => {
      await writePkg({
        name: 'test',
        devDependencies: { 'tsc-alias': '^1.8.0' },
      });

      const processes = discoverDevProcesses(tmpDir, {});
      const build = processes.find((p) => p.name === 'build');

      expect(build?.command).toContain('&& tsc-alias');
    });

    it('chains tsc-alias with project flag when tsconfig.build.json exists', async () => {
      await touch('tsconfig.build.json');
      await writePkg({
        name: 'test',
        devDependencies: { 'tsc-alias': '^1.8.0' },
      });

      const processes = discoverDevProcesses(tmpDir, {});
      const build = processes.find((p) => p.name === 'build');

      expect(build?.command).toBe(
        'tsc --pretty false -p tsconfig.build.json && tsc-alias -p tsconfig.build.json',
      );
    });

    it('uses consumer registry from metadata', async () => {
      await touch('src/queues/custom/index.ts');
      await writePkg({ name: 'test' });

      const metadata: CliMetadata = {
        consumer: { registry: 'src/queues/custom/index.ts' },
      };
      const processes = discoverDevProcesses(tmpDir, metadata);

      expect(processes.find((p) => p.name === 'consumer')).toBeDefined();
    });
  });
});

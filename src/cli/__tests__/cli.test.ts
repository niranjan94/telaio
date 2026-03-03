import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBuildCommand } from '../build.js';
import { readTelaioConfig } from '../config.js';
import { registerDbTypesCommand } from '../db-types.js';
import {
  matchesIncludePatterns,
  parseAddFlag,
  registerDevCommand,
  stripAnsi,
} from '../dev.js';
import { registerGenClientCommand, resolveTelaioApp } from '../gen-client.js';
import { registerInitCommand } from '../init.js';
import { registerMigrateCommand } from '../migrate.js';

describe('CLI command registration', () => {
  it('registers init command', () => {
    const program = new Command();
    registerInitCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'init');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Scaffold a new Telaio project');
  });

  it('registers migrate command group', () => {
    const program = new Command();
    registerMigrateCommand(program);
    const migrate = program.commands.find((c) => c.name() === 'migrate');
    expect(migrate).toBeDefined();

    const subcommands = migrate?.commands.map((c) => c.name()) ?? [];
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('latest');
    expect(subcommands).toContain('up');
    expect(subcommands).toContain('down');
    expect(subcommands).toContain('status');
  });

  it('registers gen-client command', () => {
    const program = new Command();
    registerGenClientCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'gen-client');
    expect(cmd).toBeDefined();
  });

  it('registers db:types command', () => {
    const program = new Command();
    registerDbTypesCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'db:types');
    expect(cmd).toBeDefined();
  });

  it('registers build command', () => {
    const program = new Command();
    registerBuildCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'build');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Run the sequential build pipeline');
  });

  it('registers dev command', () => {
    const program = new Command();
    registerDevCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'dev');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe(
      'Run development processes with centralized file watching and auto-restart',
    );
  });
});

describe('telaio init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-init-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds project files', async () => {
    const program = new Command();
    program.exitOverride(); // Prevent process.exit
    registerInitCommand(program);

    await program.parseAsync(['node', 'test', 'init', tmpDir]);

    // Check key files were created
    const telaioConfigStat = await fs.stat(
      path.join(tmpDir, 'src/telaio.config.ts'),
    );
    expect(telaioConfigStat.isFile()).toBe(true);

    const configStat = await fs.stat(path.join(tmpDir, 'src/config.ts'));
    expect(configStat.isFile()).toBe(true);

    const appStat = await fs.stat(path.join(tmpDir, 'src/app.ts'));
    expect(appStat.isFile()).toBe(true);

    const serverStat = await fs.stat(path.join(tmpDir, 'src/server.ts'));
    expect(serverStat.isFile()).toBe(true);

    const routeStat = await fs.stat(
      path.join(tmpDir, 'src/routes/v1/ping/actions.ts'),
    );
    expect(routeStat.isFile()).toBe(true);

    const tsconfigStat = await fs.stat(path.join(tmpDir, 'tsconfig.json'));
    expect(tsconfigStat.isFile()).toBe(true);

    const biomeStat = await fs.stat(path.join(tmpDir, 'biome.json'));
    expect(biomeStat.isFile()).toBe(true);

    const envStat = await fs.stat(path.join(tmpDir, '.env'));
    expect(envStat.isFile()).toBe(true);
  });

  it('does not overwrite existing files', async () => {
    // Create a file first
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'src/config.ts'),
      'custom content',
      'utf-8',
    );

    const program = new Command();
    program.exitOverride();
    registerInitCommand(program);

    await program.parseAsync(['node', 'test', 'init', tmpDir]);

    // Original content should be preserved
    const content = await fs.readFile(
      path.join(tmpDir, 'src/config.ts'),
      'utf-8',
    );
    expect(content).toBe('custom content');
  });
});

describe('telaio migrate create', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-migrate-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a timestamped migration file', async () => {
    const program = new Command();
    program.exitOverride();
    registerMigrateCommand(program);

    const migrationDir = path.join(tmpDir, 'migrations');
    await program.parseAsync([
      'node',
      'test',
      'migrate',
      'create',
      'add-users',
      '-d',
      migrationDir,
    ]);

    const files = await fs.readdir(migrationDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{14}_add-users\.ts$/);

    // Check content
    const content = await fs.readFile(
      path.join(migrationDir, files[0]),
      'utf-8',
    );
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
  });
});

describe('readTelaioConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads full telaio config from package.json', async () => {
    const pkg = {
      name: 'test',
      telaio: {
        app: './dist/app.js',
        client: {
          output: 'generated',
          plugins: ['@hey-api/typescript'],
        },
        consumer: {
          registry: './dist/queues.js',
        },
        dev: {
          processes: [{ name: 'api', command: 'tsx watch src/server.ts' }],
        },
      },
    };
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg),
      'utf-8',
    );

    const config = readTelaioConfig(tmpDir);
    expect(config.app).toBe('./dist/app.js');
    expect(config.client?.output).toBe('generated');
    expect(config.client?.plugins).toEqual(['@hey-api/typescript']);
    expect(config.consumer?.registry).toBe('./dist/queues.js');
    expect(config.dev?.processes).toHaveLength(1);
  });

  it('returns empty config when telaio key is missing', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
      'utf-8',
    );

    const config = readTelaioConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('returns empty config when package.json is missing', () => {
    const config = readTelaioConfig(path.join(tmpDir, 'nonexistent'));
    expect(config).toEqual({});
  });
});

describe('telaio dev helpers', () => {
  describe('parseAddFlag', () => {
    it('parses "name:command" format', () => {
      const result = parseAddFlag('api:tsx watch src/server.ts');
      expect(result).toEqual({
        name: 'api',
        command: 'tsx watch src/server.ts',
      });
    });

    it('handles colons in the command part', () => {
      const result = parseAddFlag('types:tsc -w --host 0.0.0.0:3000');
      expect(result).toEqual({
        name: 'types',
        command: 'tsc -w --host 0.0.0.0:3000',
      });
    });

    it('returns null for missing colon', () => {
      expect(parseAddFlag('no-colon-here')).toBeNull();
    });

    it('returns null for leading colon', () => {
      expect(parseAddFlag(':command')).toBeNull();
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI color codes', () => {
      expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
    });

    it('removes multiple ANSI sequences', () => {
      expect(stripAnsi('\x1b[1m\x1b[34mbold blue\x1b[0m normal')).toBe(
        'bold blue normal',
      );
    });

    it('passes through plain text unchanged', () => {
      expect(stripAnsi('no colors here')).toBe('no colors here');
    });

    it('removes OSC sequences', () => {
      expect(stripAnsi('\x1b]0;title\x07rest')).toBe('rest');
    });
  });

  describe('resolveTelaioApp', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-app-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('finds buildFastifyApp builder function', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'app.mjs'),
        `export function buildFastifyApp(ephemeral) {
          return { fastify: { ready: async () => {}, close: async () => {} }, ephemeral };
        }`,
        'utf-8',
      );

      const app = await resolveTelaioApp('app.mjs', tmpDir);
      expect(app.fastify).toBeDefined();
    });

    it('finds buildApp builder function', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'app.mjs'),
        `export function buildApp(ephemeral) {
          return { fastify: { ready: async () => {}, close: async () => {} }, ephemeral };
        }`,
        'utf-8',
      );

      const app = await resolveTelaioApp('app.mjs', tmpDir);
      expect(app.fastify).toBeDefined();
    });

    it('finds default export as builder function', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'app.mjs'),
        `export default function(ephemeral) {
          return { fastify: { ready: async () => {}, close: async () => {} }, ephemeral };
        }`,
        'utf-8',
      );

      const app = await resolveTelaioApp('app.mjs', tmpDir);
      expect(app.fastify).toBeDefined();
    });

    it('falls back to pre-built app export', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'app.mjs'),
        `export const app = { fastify: { ready: async () => {}, close: async () => {} } };`,
        'utf-8',
      );

      const app = await resolveTelaioApp('app.mjs', tmpDir);
      expect(app.fastify).toBeDefined();
    });

    it('throws when no app found', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'app.mjs'),
        `export const nothing = 42;`,
        'utf-8',
      );

      await expect(resolveTelaioApp('app.mjs', tmpDir)).rejects.toThrow(
        'could not find a TelaioApp',
      );
    });
  });

  describe('matchesIncludePatterns', () => {
    const cwd = '/project';

    it('matches files inside an included directory', () => {
      expect(
        matchesIncludePatterns('/project/src/foo/bar.ts', ['src'], cwd),
      ).toBe(true);
    });

    it('matches exact file paths', () => {
      expect(matchesIncludePatterns('/project/.env', ['.env'], cwd)).toBe(true);
    });

    it('does not match files outside included patterns', () => {
      expect(
        matchesIncludePatterns('/project/dist/index.js', ['src', '.env'], cwd),
      ).toBe(false);
    });

    it('does not match partial directory names', () => {
      expect(
        matchesIncludePatterns('/project/src-backup/file.ts', ['src'], cwd),
      ).toBe(false);
    });

    it('handles multiple patterns', () => {
      expect(
        matchesIncludePatterns('/project/.env', ['src', '.env'], cwd),
      ).toBe(true);
      expect(
        matchesIncludePatterns('/project/src/app.ts', ['src', '.env'], cwd),
      ).toBe(true);
    });
  });
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBuildCommand } from '../build.js';
import { readTelaioConfig } from '../config.js';
import { registerDbTypesCommand } from '../db-types.js';
import { parseAddFlag, readDevConfig, registerDevCommand } from '../dev.js';
import { registerGenClientCommand } from '../gen-client.js';
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
      'Run development processes concurrently with prefixed output',
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

  describe('readDevConfig', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-dev-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('reads processes from package.json telaio.dev key', async () => {
      const pkg = {
        name: 'test',
        telaio: {
          dev: {
            processes: [
              { name: 'api', command: 'tsx watch src/server.ts' },
              { name: 'types', command: 'tsc -w' },
            ],
          },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkg),
        'utf-8',
      );

      const config = readDevConfig(tmpDir);
      expect(config.processes).toHaveLength(2);
      expect(config.processes?.[0]?.name).toBe('api');
    });

    it('returns empty processes when telaio.dev is missing', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test' }),
        'utf-8',
      );

      const config = readDevConfig(tmpDir);
      expect(config.processes).toEqual([]);
    });

    it('returns empty processes when package.json is missing', () => {
      const config = readDevConfig(path.join(tmpDir, 'nonexistent'));
      expect(config.processes).toEqual([]);
    });
  });
});

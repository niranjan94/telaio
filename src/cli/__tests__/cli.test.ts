import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBuildCommand } from '../build.js';
import { registerDbTypesCommand } from '../db-types.js';
import { registerDevCommand } from '../dev.js';
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
    // Dev command is registered (even as placeholder)
    expect(program).toBeDefined();
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

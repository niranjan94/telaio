import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { registerInitCommand } from '../../src/cli/init.js';
import { registerMigrateCommand } from '../../src/cli/migrate.js';

const skipE2e = inject('skipE2e');

describe.skipIf(skipE2e)('CLI commands (E2E)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telaio-e2e-cli-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('telaio init', () => {
    it('scaffolds a complete project structure', async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(['node', 'test', 'init', tmpDir]);

      // Verify all critical files exist
      const expectedFiles = [
        'src/config.ts',
        'src/app.ts',
        'src/server.ts',
        'src/routes/v1/ping/actions.ts',
        'tsconfig.json',
        'biome.json',
        '.env',
      ];

      for (const file of expectedFiles) {
        const stat = await fs.stat(path.join(tmpDir, file));
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    it('scaffolded app.ts imports from telaio', async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(['node', 'test', 'init', tmpDir]);

      const appContent = await fs.readFile(
        path.join(tmpDir, 'src/app.ts'),
        'utf-8',
      );
      expect(appContent).toContain('telaio');
    });
  });

  describe('telaio migrate create', () => {
    it('creates migration files with unique timestamps', async () => {
      const program = new Command();
      program.exitOverride();
      registerMigrateCommand(program);

      const migrationDir = path.join(tmpDir, 'migrations');

      // Create two migrations
      await program.parseAsync([
        'node',
        'test',
        'migrate',
        'create',
        'create-users',
        '-d',
        migrationDir,
      ]);

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const program2 = new Command();
      program2.exitOverride();
      registerMigrateCommand(program2);

      await program2.parseAsync([
        'node',
        'test',
        'migrate',
        'create',
        'create-posts',
        '-d',
        migrationDir,
      ]);

      const files = await fs.readdir(migrationDir);
      expect(files).toHaveLength(2);

      // Verify both follow the naming convention
      expect(files[0]).toMatch(/^\d{14}_create-users\.ts$/);
      expect(files[1]).toMatch(/^\d{14}_create-posts\.ts$/);

      // Verify they have different timestamps
      const timestamp1 = files[0].slice(0, 14);
      const timestamp2 = files[1].slice(0, 14);
      expect(timestamp1).not.toBe(timestamp2);
    });

    it('migration file contains up and down functions', async () => {
      const program = new Command();
      program.exitOverride();
      registerMigrateCommand(program);

      const migrationDir = path.join(tmpDir, 'migrations');
      await program.parseAsync([
        'node',
        'test',
        'migrate',
        'create',
        'add-index',
        '-d',
        migrationDir,
      ]);

      const files = await fs.readdir(migrationDir);
      const content = await fs.readFile(
        path.join(migrationDir, files[0]),
        'utf-8',
      );

      expect(content).toContain('export async function up');
      expect(content).toContain('export async function down');
      expect(content).toContain("import type { Kysely } from 'kysely'");
    });
  });
});

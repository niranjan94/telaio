import { describe, expect, it } from 'vitest';

describe('migrator', () => {
  it('exports createMigrationFile', async () => {
    const mod = await import('../migrator.js');
    expect(mod.createMigrationFile).toBeDefined();
    expect(typeof mod.createMigrationFile).toBe('function');
  });

  it('exports createMigrator', async () => {
    const mod = await import('../migrator.js');
    expect(mod.createMigrator).toBeDefined();
    expect(typeof mod.createMigrator).toBe('function');
  });

  it('exports runFrameworkMigrations', async () => {
    const mod = await import('../migrator.js');
    expect(mod.runFrameworkMigrations).toBeDefined();
    expect(typeof mod.runFrameworkMigrations).toBe('function');
  });

  it('exports migrateToLatest', async () => {
    const mod = await import('../migrator.js');
    expect(mod.migrateToLatest).toBeDefined();
    expect(typeof mod.migrateToLatest).toBe('function');
  });
});

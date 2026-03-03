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

  it('exports migrateUp', async () => {
    const mod = await import('../migrator.js');
    expect(mod.migrateUp).toBeDefined();
    expect(typeof mod.migrateUp).toBe('function');
  });

  it('exports migrateDown', async () => {
    const mod = await import('../migrator.js');
    expect(mod.migrateDown).toBeDefined();
    expect(typeof mod.migrateDown).toBe('function');
  });
});

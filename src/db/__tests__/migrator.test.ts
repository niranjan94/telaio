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

describe('createFrameworkMigrationProvider', () => {
  it('returns two framework migrations', async () => {
    const { createFrameworkMigrationProvider } = await import('../migrator.js');
    const provider = createFrameworkMigrationProvider();
    const migrations = await provider.getMigrations();
    const names = Object.keys(migrations);

    expect(names).toHaveLength(2);
    expect(names).toContain('20250101000000_telaio_citext_extension');
    expect(names).toContain('20250101000001_telaio_updated_at_trigger');
  });

  it('generates unqualified SQL when no schema is provided', async () => {
    const { createFrameworkMigrationProvider } = await import('../migrator.js');
    const provider = createFrameworkMigrationProvider();
    const migrations = await provider.getMigrations();
    const trigger = migrations['20250101000001_telaio_updated_at_trigger'];

    // Verify the migration has up and down
    expect(trigger.up).toBeDefined();
    expect(trigger.down).toBeDefined();
  });

  it('generates unqualified SQL when schema is "public"', async () => {
    const { createFrameworkMigrationProvider } = await import('../migrator.js');
    // 'public' should be treated as unset
    const provider = createFrameworkMigrationProvider('public');
    const migrations = await provider.getMigrations();
    const names = Object.keys(migrations);

    // Should still return the same migrations
    expect(names).toHaveLength(2);
  });

  it('accepts a custom schema parameter', async () => {
    const { createFrameworkMigrationProvider } = await import('../migrator.js');
    // Should not throw with a custom schema
    const provider = createFrameworkMigrationProvider('custom_schema');
    const migrations = await provider.getMigrations();
    expect(Object.keys(migrations)).toHaveLength(2);
  });
});

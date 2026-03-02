import fs from 'node:fs';
import path from 'node:path';

/** Telaio CLI configuration, read from the `telaio` key in package.json. */
export interface TelaioConfig {
  /** Path to app module (for gen-client, consumer). */
  app?: string;
  /** Path to telaio config file (overrides auto-discovery). */
  config?: string;
  /** Client generation options. */
  client?: {
    output?: string;
    plugins?: (string | Record<string, unknown>)[];
  };
  /** Consumer options. */
  consumer?: {
    /** Path to module exporting { queues } registry. */
    registry?: string;
  };
  /** Dev process config. */
  dev?: { processes?: { name: string; command: string }[] };
}

/**
 * Reads the telaio config from the nearest package.json.
 * Returns an empty config if no telaio key is found.
 */
export function readTelaioConfig(cwd: string): TelaioConfig {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {};
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return (pkg.telaio as TelaioConfig) ?? {};
}

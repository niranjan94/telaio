import fs from 'node:fs';
import path from 'node:path';

import {
  isDefineConfigResult,
  loadConfigAsync,
  loadEnv,
} from '../config/index.js';
import { readTelaioConfig } from './config.js';

/** Config file extensions to auto-discover, in priority order. */
const CONFIG_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs'];

/** Per-cwd cache of resolved config objects. */
const configCache = new Map<string, Record<string, unknown>>();

/**
 * Finds the telaio config file in the given directory.
 * Checks the explicit `telaio.config` path from package.json first,
 * then auto-discovers `telaio.config.{ts,js,mts,mjs}`.
 */
export function findConfigFile(cwd: string): string | null {
  const telaioConfig = readTelaioConfig(cwd);

  // Explicit path from package.json
  if (telaioConfig.config) {
    const explicit = path.resolve(cwd, telaioConfig.config);
    if (fs.existsSync(explicit)) {
      return explicit;
    }
  }

  // Auto-discover
  for (const ext of CONFIG_EXTENSIONS) {
    const candidate = path.join(cwd, `telaio.config${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolves the app config for CLI commands.
 *
 * 1. Looks for a `telaio.config.{ts,js,mts,mjs}` file (or explicit path).
 * 2. If found and branded via `defineConfig()`: calls `loadConfigAsync()`.
 * 3. If found but not branded: uses the default export directly.
 * 4. If not found: loads `.env` and returns `process.env`.
 *
 * Results are cached per `cwd`.
 */
export async function resolveCliConfig(
  cwd: string,
): Promise<Record<string, unknown>> {
  const cached = configCache.get(cwd);
  if (cached) {
    return cached;
  }

  const configFile = findConfigFile(cwd);

  let resolved: Record<string, unknown>;

  if (configFile) {
    const mod = await import(new URL(`file://${configFile}`).href);
    const exported = mod.default ?? mod;

    if (isDefineConfigResult(exported)) {
      resolved = await loadConfigAsync(exported);
    } else if (typeof exported === 'object' && exported !== null) {
      resolved = exported as Record<string, unknown>;
    } else {
      // Unexpected export, fall back to env
      await loadEnv();
      resolved = { ...process.env };
    }
  } else {
    await loadEnv();
    resolved = { ...process.env };
  }

  configCache.set(cwd, resolved);
  return resolved;
}

/** Resets the config cache. For testing only. */
export function _resetConfigCache(): void {
  configCache.clear();
}

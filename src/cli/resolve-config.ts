import fs from 'node:fs';
import path from 'node:path';

import {
  type CliMetadata,
  extractCliMetadata,
  isDefineConfigResult,
  loadConfigAsync,
  loadEnv,
} from '../config/index.js';
import { readTelaioConfig } from './config.js';

/** Config file extensions to auto-discover, in priority order. */
const CONFIG_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs'];

/** Per-cwd cache of resolved config objects. */
const configCache = new Map<string, Record<string, unknown>>();

/** Per-cwd cache of CLI metadata (no env loading). */
const metadataCache = new Map<string, CliMetadata>();

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
  for (const pathPrefix of [
    'telaio.config',
    path.join('src', 'telaio.config'),
    path.join('dist', 'telaio.config'),
    path.join('dist/src', 'telaio.config'),
    'config',
    path.join('src', 'config'),
    path.join('dist', 'config'),
    path.join('dist/src', 'config'),
  ]) {
    for (const ext of CONFIG_EXTENSIONS) {
      const candidate = path.join(cwd, `${pathPrefix}${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Loads CLI metadata from a defineConfig result without loading env vars.
 * Falls back to reading the telaio key from package.json (with deprecation warning).
 * Results are cached per cwd.
 */
export async function loadCliMetadata(cwd: string): Promise<CliMetadata> {
  const cached = metadataCache.get(cwd);
  if (cached) return cached;

  const configFile = findConfigFile(cwd);

  let metadata: CliMetadata;

  if (configFile) {
    const mod = await import(new URL(`file://${configFile}`).href);
    const exported = mod.default ?? mod;

    if (isDefineConfigResult(exported)) {
      metadata = extractCliMetadata(exported);
    } else {
      // Config file exists but isn't branded -- fall back to package.json
      metadata = readTelaioConfigAsMetadata(cwd);
    }
  } else {
    metadata = readTelaioConfigAsMetadata(cwd);
  }

  metadataCache.set(cwd, metadata);
  return metadata;
}

/**
 * Reads the telaio key from package.json and converts it to CliMetadata.
 * Emits a deprecation warning when the key is found.
 */
function readTelaioConfigAsMetadata(cwd: string): CliMetadata {
  const pkgConfig = readTelaioConfig(cwd);

  if (
    pkgConfig.app ||
    pkgConfig.client ||
    pkgConfig.consumer ||
    pkgConfig.dev
  ) {
    console.warn(
      'telaio: the "telaio" key in package.json is deprecated. ' +
        'Move CLI config into defineConfig() in telaio.config.ts instead.',
    );
  }

  return {
    app: pkgConfig.app,
    client: pkgConfig.client,
    consumer: pkgConfig.consumer,
    dev: pkgConfig.dev
      ? {
          processes: pkgConfig.dev.processes,
          watch: pkgConfig.dev.watch,
          output: pkgConfig.dev.output,
        }
      : undefined,
  };
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

/** Resets the config and metadata caches. For testing only. */
export function _resetConfigCache(): void {
  configCache.clear();
  metadataCache.clear();
}

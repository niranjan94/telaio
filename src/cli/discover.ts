import fs from 'node:fs';
import path from 'node:path';
import type { CliMetadata } from '../config/index.js';

/** A discovered dev process definition. */
export interface DiscoveredProcess {
  name: string;
  command: string;
  prefixColor?: string;
}

/** Candidate paths for the API server entry point, in priority order. */
const API_SERVER_CANDIDATES = ['src/api/server.ts', 'src/server.ts'];

/** Candidate paths for the app builder module, in priority order. */
const APP_MODULE_CANDIDATES = ['src/api/fastify.ts', 'src/app.ts'];

/** Default path for the queue consumer registry. */
const DEFAULT_CONSUMER_REGISTRY = 'src/queues/registry/index.ts';

/**
 * Discovers the app builder module path.
 * Checks metadata.app first, then convention candidates.
 */
export function discoverAppModule(
  cwd: string,
  metadata: CliMetadata,
): string | null {
  if (metadata.app) {
    const explicit = path.resolve(cwd, metadata.app);
    if (fs.existsSync(explicit)) return metadata.app;
  }

  for (const candidate of APP_MODULE_CANDIDATES) {
    if (fs.existsSync(path.join(cwd, candidate))) return candidate;
  }

  return null;
}

/**
 * Discovers the queue consumer registry path.
 * Checks metadata.consumer.registry first, then default path.
 */
export function discoverConsumerRegistry(
  cwd: string,
  metadata: CliMetadata,
): string | null {
  const registryPath = metadata.consumer?.registry ?? DEFAULT_CONSUMER_REGISTRY;
  if (fs.existsSync(path.join(cwd, registryPath))) return registryPath;
  return null;
}

/**
 * Detects whether tsc-alias is available in the project's devDependencies.
 */
function hasTscAlias(cwd: string): boolean {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return !!(
    pkg.devDependencies?.['tsc-alias'] || pkg.dependencies?.['tsc-alias']
  );
}

/**
 * Builds the TypeScript compilation command.
 * Uses tsconfig.build.json if available, chains tsc-alias if installed.
 */
function buildTscCommand(cwd: string): string {
  const hasBuildTsconfig = fs.existsSync(path.join(cwd, 'tsconfig.build.json'));
  const projectFlag = hasBuildTsconfig ? ' -p tsconfig.build.json' : '';
  const tscCmd = `tsc --pretty false${projectFlag}`;

  if (hasTscAlias(cwd)) {
    const aliasProjectFlag = hasBuildTsconfig ? ' -p tsconfig.build.json' : '';
    return `${tscCmd} && tsc-alias${aliasProjectFlag}`;
  }

  return tscCmd;
}

/**
 * Auto-discovers standard dev processes by convention.
 * Each process is only included if the required files exist.
 *
 * Auto-discovered processes:
 * - api: runs tsx on the server entry point
 * - consumer: runs telaio consumer
 * - client-gen: runs telaio gen-client (when app module exists and client is enabled)
 * - build: runs tsc (with optional tsc-alias)
 */
export function discoverDevProcesses(
  cwd: string,
  metadata: CliMetadata,
): DiscoveredProcess[] {
  const processes: DiscoveredProcess[] = [];

  // 1. API server process
  for (const candidate of API_SERVER_CANDIDATES) {
    if (fs.existsSync(path.join(cwd, candidate))) {
      processes.push({ name: 'api', command: `tsx ${candidate}` });
      break;
    }
  }

  // 2. Consumer process
  if (discoverConsumerRegistry(cwd, metadata)) {
    processes.push({ name: 'consumer', command: 'telaio consumer' });
  }

  // 3. Client generation process
  const clientEnabled = metadata.client?.enabled !== false;
  if (clientEnabled && discoverAppModule(cwd, metadata)) {
    processes.push({ name: 'client-gen', command: 'telaio gen-client' });
  }

  // 4. Build process (always included -- every project has TypeScript)
  processes.push({ name: 'build', command: buildTscCommand(cwd) });

  return processes;
}

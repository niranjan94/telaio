import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { discoverDevProcesses } from './discover.js';
import { ProcessManager } from './process-manager.js';
import { loadCliMetadata } from './resolve-config.js';

/** A process definition for the dev runner. */
export interface DevProcess {
  name: string;
  command: string;
  /** ANSI color for the prefix label (chalk color name or hex). */
  prefixColor?: string;
}

/** Default paths that trigger a process restart when changed. */
const DEFAULT_WATCH_INCLUDE = ['src', '.env'];

/** Default paths excluded from the file watcher. */
const DEFAULT_WATCH_IGNORE = ['node_modules', '.git', 'dist'];

/** Default debounce interval for file change events (ms). */
const DEFAULT_DEBOUNCE_MS = 300;

/** Default log file path for tee output. */
const DEFAULT_OUTPUT = 'output.log';

/** Regex to strip ANSI escape sequences from a string. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional -- matching ANSI escape codes
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g;

/**
 * Strips ANSI escape codes from a string.
 * Used to write clean log files while preserving color on stdout.
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

/**
 * Parses an "--add" flag value in the format "name:command".
 * Returns the parsed process definition, or null if invalid.
 */
export function parseAddFlag(value: string): DevProcess | null {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1 || colonIndex === 0) return null;
  return {
    name: value.slice(0, colonIndex),
    command: value.slice(colonIndex + 1),
  };
}

/**
 * Checks whether a changed file path matches any of the configured include patterns.
 * Patterns are matched as path prefixes (for directories) or exact matches (for files).
 */
export function matchesIncludePatterns(
  filePath: string,
  patterns: string[],
  cwd: string,
): boolean {
  const relative = path.relative(cwd, filePath);
  for (const pattern of patterns) {
    if (relative === pattern || relative.startsWith(`${pattern}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Lazily imports @parcel/watcher.
 * Throws a descriptive error if not installed.
 */
async function importWatcher() {
  try {
    const mod = await import('@parcel/watcher');
    return mod.default ?? mod;
  } catch {
    throw new Error(
      "telaio: dev command requires '@parcel/watcher'. Install it: pnpm add -D @parcel/watcher",
    );
  }
}

/**
 * Creates a file logger for stripped process output.
 */
function createLogFile(outputPath: string): {
  write: (line: string) => void;
  close: () => void;
} {
  const fileStream = fs.createWriteStream(outputPath);

  return {
    write: (line: string) => {
      fileStream.write(`${line}\n`);
    },
    close: () => {
      fileStream.end();
    },
  };
}

/**
 * Merges user-provided paths with defaults, deduplicating via Set.
 */
function mergePaths(defaults: string[], additional?: string[]): string[] {
  if (!additional || additional.length === 0) return defaults;
  return [...new Set([...defaults, ...additional])];
}

/**
 * Orchestrates the dev environment: auto-discovers processes,
 * spawns them via the process manager, watches files, and restarts on changes.
 */
async function runDev(options: {
  add: string[];
  output?: string;
  noOutput?: boolean;
}): Promise<void> {
  const cwd = process.cwd();
  const metadata = await loadCliMetadata(cwd);
  const devConfig = metadata.dev;

  // Auto-discover processes, then append config-defined and --add processes
  const processes: DevProcess[] = discoverDevProcesses(cwd, metadata);

  // Append additional processes from config (additive)
  if (devConfig?.processes) {
    for (const p of devConfig.processes) {
      // Skip if a process with the same name was already discovered
      if (!processes.some((existing) => existing.name === p.name)) {
        processes.push(p);
      }
    }
  }

  // Parse --add flags
  for (const raw of options.add) {
    const parsed = parseAddFlag(raw);
    if (!parsed) {
      console.error(`Invalid --add format: "${raw}". Expected "name:command".`);
      process.exit(1);
    }
    processes.push(parsed);
  }

  if (processes.length === 0) {
    console.error(
      'No processes to run. Add processes via defineConfig({ dev: { processes } }) or --add.',
    );
    process.exit(1);
  }

  const watcher = await importWatcher();

  // Merge watch config: defaults + additive user config
  const includePatterns = mergePaths(
    DEFAULT_WATCH_INCLUDE,
    devConfig?.watch?.include,
  );
  const ignorePatterns = mergePaths(
    DEFAULT_WATCH_IGNORE,
    devConfig?.watch?.ignore,
  );
  const debounceMs = devConfig?.watch?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // Output: --no-output disables, --output overrides, config overrides default
  const outputPath = options.noOutput
    ? undefined
    : (options.output ?? devConfig?.output ?? DEFAULT_OUTPUT);

  const logFile = outputPath ? createLogFile(outputPath) : null;
  const manager = new ProcessManager({
    processes,
    cwd,
    onOutput: (line) => {
      process.stdout.write(`${line}\n`);
      logFile?.write(stripAnsi(line));
    },
  });

  manager.cleanupStale();

  let restarting = false;
  let restartPending = false;
  let shuttingDown = false;

  const restart = async () => {
    if (restarting) {
      restartPending = true;
      return;
    }

    restarting = true;
    await manager.stopAll();
    manager.startAll();
    restarting = false;

    if (restartPending) {
      restartPending = false;
      await restart();
    }
  };

  // Initial start
  console.log(`Starting ${processes.length} process(es):`);
  for (const p of processes) {
    console.log(`  - ${p.name}: ${p.command}`);
  }
  if (outputPath) {
    console.log(`Output: ${outputPath}`);
  }
  console.log();
  manager.startAll();

  // Set up file watcher
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const subscription = await watcher.subscribe(
    cwd,
    (_err, events) => {
      if (!events || events.length === 0) return;

      // Check if any event matches our include patterns
      const hasRelevantChange = events.some((event) =>
        matchesIncludePatterns(event.path, includePatterns, cwd),
      );

      if (!hasRelevantChange) return;

      // Debounce rapid changes
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const changedFiles = events
          .filter((e) => matchesIncludePatterns(e.path, includePatterns, cwd))
          .map((e) => path.relative(cwd, e.path));

        console.log(`\nFile change detected: ${changedFiles.join(', ')}`);
        console.log('Restarting...\n');

        await restart();
      }, debounceMs);
    },
    { ignore: ignorePatterns },
  );

  /** Graceful shutdown: unsubscribe watcher, kill processes, exit. */
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('\nShutting down...');

    if (debounceTimer) clearTimeout(debounceTimer);
    await subscription.unsubscribe();
    await manager.stopAll();
    logFile?.close();

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

/** Registers the `telaio dev` CLI command. */
export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description(
      'Run development processes with centralized file watching and auto-restart',
    )
    .option(
      '--add <name:command>',
      'Add an ad-hoc process (repeatable)',
      (value: string, prev: string[]) => {
        prev.push(value);
        return prev;
      },
      [] as string[],
    )
    .option('--output <path>', 'Override the log file path')
    .option('--no-output', 'Disable file output')
    .action(
      async (options: {
        add: string[];
        output?: string;
        noOutput?: boolean;
      }) => {
        await runDev(options);
      },
    );
}

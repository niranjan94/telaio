import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { Command } from 'commander';
import { readTelaioConfig } from './config.js';

/** A process definition from the telaio.dev config in package.json. */
export interface DevProcess {
  name: string;
  command: string;
  /** ANSI color for the prefix label (chalk color name or hex). */
  prefixColor?: string;
}

/** File watcher configuration for centralized restart. */
export interface DevWatchConfig {
  /** Paths/patterns that trigger restarts. Default: ['src', '.env']. */
  include?: string[];
  /** Paths to exclude from watching. Default: ['node_modules', '.git', 'dist']. */
  ignore?: string[];
  /** Debounce interval in ms. Default: 300. */
  debounceMs?: number;
}

/** The telaio.dev config shape in package.json. */
export interface DevConfig {
  processes?: DevProcess[];
  /** File watcher configuration for centralized restart. */
  watch?: DevWatchConfig;
  /** Strip ANSI escape codes from output. Default: false. */
  stripAnsi?: boolean;
  /** Log file path to tee output to. */
  output?: string;
}

/** Default paths that trigger a process restart when changed. */
const DEFAULT_WATCH_INCLUDE = ['src', '.env'];

/** Default paths excluded from the file watcher. */
const DEFAULT_WATCH_IGNORE = ['node_modules', '.git', 'dist'];

/** Default debounce interval for file change events (ms). */
const DEFAULT_DEBOUNCE_MS = 300;

/** Grace period (ms) before SIGKILL after SIGTERM. */
const KILL_TIMEOUT_MS = 5_000;

/**
 * Reads telaio.dev config from the nearest package.json.
 * Returns an empty config if the key is missing.
 */
export function readDevConfig(cwd: string): DevConfig {
  const config = readTelaioConfig(cwd);
  return config.dev ?? {};
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
 * Lazily imports the concurrently package.
 * Throws a descriptive error if not installed.
 */
async function importConcurrently() {
  try {
    const mod = await import('concurrently');
    return (mod.default ??
      mod.concurrently) as typeof import('concurrently').concurrently;
  } catch {
    throw new Error(
      "telaio: dev command requires 'concurrently'. Install it: pnpm add -D concurrently",
    );
  }
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
 * Creates a Writable stream that tees output to both stdout and a file.
 * Used when the `output` config option is set.
 */
function createTeeStream(outputPath: string): {
  stream: Writable;
  close: () => void;
} {
  const fileStream = fs.createWriteStream(outputPath);

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      process.stdout.write(chunk);
      fileStream.write(chunk, callback);
    },
  });

  return {
    stream,
    close: () => {
      stream.end();
      fileStream.end();
    },
  };
}

/**
 * Orchestrates the dev environment: spawns processes via concurrently,
 * watches files via @parcel/watcher, and restarts on changes.
 */
async function runDev(options: {
  add: string[];
  stripAnsi?: boolean;
  output?: string;
}): Promise<void> {
  const cwd = process.cwd();
  const config = readDevConfig(cwd);
  const processes: DevProcess[] = [...(config.processes ?? [])];

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
      'No processes to run. Configure telaio.dev.processes in package.json.',
    );
    process.exit(1);
  }

  const concurrently = await importConcurrently();
  const watcher = await importWatcher();

  const watchConfig = config.watch ?? {};
  const includePatterns = watchConfig.include ?? DEFAULT_WATCH_INCLUDE;
  const ignorePatterns = watchConfig.ignore ?? DEFAULT_WATCH_IGNORE;
  const debounceMs = watchConfig.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const stripAnsi = options.stripAnsi ?? config.stripAnsi ?? false;
  const outputPath = options.output ?? config.output;

  // Set up output tee-ing if configured
  const tee = outputPath ? createTeeStream(outputPath) : null;

  // Build concurrently command inputs
  const commands = processes.map((p) => ({
    command: p.command,
    name: p.name,
    prefixColor: p.prefixColor,
    env: { FORCE_COLOR: stripAnsi ? undefined : '1' },
  }));

  const concurrentlyOptions: Record<string, unknown> = {
    prefix: 'name',
    padPrefix: true,
    raw: stripAnsi,
    cwd,
    ...(tee ? { outputStream: tee.stream } : {}),
  };

  let currentResult: {
    commands: { kill: (signal: string) => void }[];
    result: Promise<unknown>;
  } | null = null;
  let restarting = false;

  /** Spawns all processes via concurrently. */
  const startAll = () => {
    currentResult = concurrently(commands, concurrentlyOptions);
    currentResult.result.catch(() => {
      // Process failures are expected during restart cycles
    });
  };

  /** Kills all running processes and waits for them to exit. */
  const stopAll = async () => {
    if (!currentResult) return;
    const result = currentResult;
    currentResult = null;

    for (const cmd of result.commands) {
      try {
        cmd.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
    }

    // Wait for graceful exit or timeout
    await Promise.race([
      result.result.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, KILL_TIMEOUT_MS)),
    ]);

    // Force-kill any stragglers
    for (const cmd of result.commands) {
      try {
        cmd.kill('SIGKILL');
      } catch {
        // Already dead
      }
    }
  };

  // Initial start
  console.log(`Starting ${processes.length} process(es)...`);
  startAll();

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
        if (restarting) return;
        restarting = true;

        const changedFiles = events
          .filter((e) => matchesIncludePatterns(e.path, includePatterns, cwd))
          .map((e) => path.relative(cwd, e.path));

        console.log(`\nFile change detected: ${changedFiles.join(', ')}`);
        console.log('Restarting...\n');

        await stopAll();
        startAll();
        restarting = false;
      }, debounceMs);
    },
    { ignore: ignorePatterns },
  );

  /** Graceful shutdown: unsubscribe watcher, kill processes, exit. */
  const shutdown = async () => {
    console.log('\nShutting down...');

    if (debounceTimer) clearTimeout(debounceTimer);
    await subscription.unsubscribe();
    await stopAll();
    tee?.close();

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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
    .option('--strip-ansi', 'Strip ANSI escape codes from output')
    .option('--output <path>', 'Tee output to a log file')
    .action(
      async (options: {
        add: string[];
        stripAnsi?: boolean;
        output?: string;
      }) => {
        await runDev(options);
      },
    );
}

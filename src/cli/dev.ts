import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';

/** Color codes for process label prefixes, cycled through in order. */
const LABEL_COLORS = [
  '\x1b[36m', // cyan
  '\x1b[33m', // yellow
  '\x1b[35m', // magenta
  '\x1b[32m', // green
  '\x1b[34m', // blue
  '\x1b[31m', // red
] as const;

const RESET = '\x1b[0m';

/** A process definition from the telaio.dev config in package.json. */
export interface DevProcess {
  name: string;
  command: string;
}

/** The telaio.dev config shape in package.json. */
interface DevConfig {
  processes?: DevProcess[];
}

/**
 * Reads telaio.dev config from the nearest package.json.
 * Returns an empty processes array if the key is missing.
 */
export function readDevConfig(cwd: string): DevConfig {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { processes: [] };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return (pkg.telaio?.dev as DevConfig) ?? { processes: [] };
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
 * Prefixes each line of a chunk with a colored label.
 * Handles partial lines by buffering until a newline arrives.
 */
function createLinePrefixer(
  label: string,
  color: string,
  write: (data: string) => void,
): (chunk: Buffer) => void {
  const prefix = `${color}[${label}]${RESET} `;
  let buffer = '';

  return (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      write(`${prefix}${line}\n`);
    }
  };
}

/** Grace period (ms) before SIGKILL after SIGTERM. */
const KILL_TIMEOUT_MS = 5_000;

/**
 * Spawns all processes concurrently, prefixes their output, and handles
 * graceful shutdown via SIGINT/SIGTERM with a 5-second grace period.
 */
function runProcesses(processes: DevProcess[]): void {
  if (processes.length === 0) {
    console.error('No processes to run. Configure telaio.dev in package.json.');
    process.exit(1);
  }

  // Compute max label width for alignment
  const maxNameLen = Math.max(...processes.map((p) => p.name.length));
  const children: ChildProcess[] = [];
  let shuttingDown = false;

  for (let i = 0; i < processes.length; i++) {
    const proc = processes[i];
    const color = LABEL_COLORS[i % LABEL_COLORS.length];
    const paddedName = proc.name.padEnd(maxNameLen);

    console.log(`${color}[${paddedName}]${RESET} → ${proc.command}`);

    const child = spawn(proc.command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    const prefixStdout = createLinePrefixer(paddedName, color, (data) =>
      process.stdout.write(data),
    );
    const prefixStderr = createLinePrefixer(paddedName, color, (data) =>
      process.stderr.write(data),
    );

    child.stdout?.on('data', prefixStdout);
    child.stderr?.on('data', prefixStderr);

    child.on('exit', (code, signal) => {
      if (!shuttingDown) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        console.log(`${color}[${paddedName}]${RESET} exited (${reason})`);
      }
    });

    children.push(child);
  }

  /** Sends a signal to all still-running children. */
  const signalAll = (signal: NodeJS.Signals) => {
    for (const child of children) {
      if (child.exitCode === null && !child.killed) {
        child.kill(signal);
      }
    }
  };

  /** Graceful shutdown: SIGTERM → wait → SIGKILL. */
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down...');

    signalAll('SIGTERM');

    // Force-kill after grace period
    const killTimer = setTimeout(() => {
      signalAll('SIGKILL');
    }, KILL_TIMEOUT_MS);

    // Wait for all children to exit, then clean up
    let exited = 0;
    for (const child of children) {
      if (child.exitCode !== null) {
        exited++;
        continue;
      }
      child.on('exit', () => {
        exited++;
        if (exited === children.length) {
          clearTimeout(killTimer);
          process.exit(0);
        }
      });
    }

    // If all already exited
    if (exited === children.length) {
      clearTimeout(killTimer);
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Registers the `telaio dev` CLI command. */
export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Run development processes concurrently with prefixed output')
    .option(
      '--add <name:command>',
      'Add an ad-hoc process (repeatable)',
      (value: string, prev: string[]) => {
        prev.push(value);
        return prev;
      },
      [] as string[],
    )
    .action(async (options: { add: string[] }) => {
      const config = readDevConfig(process.cwd());
      const processes: DevProcess[] = [...(config.processes ?? [])];

      // Parse --add flags
      for (const raw of options.add) {
        const parsed = parseAddFlag(raw);
        if (!parsed) {
          console.error(
            `Invalid --add format: "${raw}". Expected "name:command".`,
          );
          process.exit(1);
        }
        processes.push(parsed);
      }

      runProcesses(processes);
    });
}

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { styleText } from 'node:util';

export interface ManagedProcess {
  name: string;
  command: string;
  prefixColor?: string;
}

export interface ProcessManagerOptions {
  processes: ManagedProcess[];
  cwd?: string;
  onOutput?: (line: string) => void;
  pidFile?: string;
}

const LABEL_COLORS = [
  'cyan',
  'yellow',
  'green',
  'magenta',
  'blue',
  'red',
] as const;

const KILL_TIMEOUT_MS = 5_000;
const WATCHDOG_POLL_SECONDS = 0.5;
const PID_FILE_NAME = '.telaio-dev.pid';

interface RunningProcess {
  child: ChildProcess;
  name: string;
  pid: number;
}

export class ProcessManager {
  private readonly processes: ManagedProcess[];
  private readonly cwd: string;
  private readonly onOutput: (line: string) => void;
  private readonly pidFilePath: string;
  private readonly maxNameLength: number;
  private running: RunningProcess[] = [];

  constructor(options: ProcessManagerOptions) {
    this.processes = options.processes;
    this.cwd = options.cwd ?? process.cwd();
    this.onOutput =
      options.onOutput ?? ((line) => process.stdout.write(`${line}\n`));
    this.pidFilePath = options.pidFile ?? path.join(this.cwd, PID_FILE_NAME);
    this.maxNameLength = Math.max(
      0,
      ...this.processes.map((process_) => process_.name.length),
    );
  }

  cleanupStale(): void {
    let pids: number[];

    try {
      const content = fs.readFileSync(this.pidFilePath, 'utf-8');
      pids = content
        .split('\n')
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => !Number.isNaN(pid) && pid > 0);
    } catch {
      return;
    }

    for (const pid of pids) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        // Process group may already be gone.
      }
    }

    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      // cleanupStale is synchronous by design and only runs at startup.
    }

    for (const pid of pids) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Process group may already be gone.
      }
    }

    this.removePidFile();
  }

  startAll(): void {
    this.running = this.processes.map((process_, index) => {
      const color =
        process_.prefixColor ?? LABEL_COLORS[index % LABEL_COLORS.length];
      return this.spawnProcess(process_, color);
    });
    this.writePidFile();
  }

  async stopAll(): Promise<void> {
    const toStop = this.running;
    this.running = [];

    if (toStop.length === 0) {
      this.removePidFile();
      return;
    }

    for (const process_ of toStop) {
      this.killProcessGroup(process_.pid, 'SIGTERM');
    }

    const exitPromises = toStop.map(
      (process_) =>
        new Promise<void>((resolve) => {
          if (
            process_.child.exitCode !== null ||
            process_.child.signalCode !== null
          ) {
            resolve();
            return;
          }

          process_.child.once('close', () => resolve());
        }),
    );

    const result = await Promise.race([
      Promise.all(exitPromises).then(() => 'exited' as const),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), KILL_TIMEOUT_MS),
      ),
    ]);

    if (result === 'timeout') {
      for (const process_ of toStop) {
        this.killProcessGroup(process_.pid, 'SIGKILL');
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    this.removePidFile();
  }

  get isRunning(): boolean {
    return this.running.length > 0;
  }

  private spawnProcess(
    process_: ManagedProcess,
    color: string,
  ): RunningProcess {
    const wrapper = [
      `${process_.command} &`,
      'CHILD=$!',
      `while kill -0 ${process.pid} 2>/dev/null; do`,
      `  sleep ${WATCHDOG_POLL_SECONDS}`,
      'done',
      'kill -TERM -- -$$ 2>/dev/null',
      'wait',
    ].join('\n');

    const child = spawn('/bin/sh', ['-c', wrapper], {
      cwd: this.cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    const pid = child.pid;
    if (!pid) {
      throw new Error(`Failed to spawn process "${process_.name}"`);
    }

    const prefix = styleText(
      color as Parameters<typeof styleText>[0],
      `[${process_.name.padEnd(this.maxNameLength)}]`,
    );

    const pipeOutput = (stream: NodeJS.ReadableStream) => {
      const reader = createInterface({ input: stream });
      reader.on('line', (line) => {
        this.onOutput(`${prefix} ${line}`);
      });
    };

    if (child.stdout) pipeOutput(child.stdout);
    if (child.stderr) pipeOutput(child.stderr);

    child.on('error', (error) => {
      this.onOutput(`${prefix} Process error: ${error.message}`);
    });

    return { child, name: process_.name, pid };
  }

  private killProcessGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pid, signal);
    } catch {
      // Process group may already be gone.
    }
  }

  private writePidFile(): void {
    const pids = this.running.map((process_) => process_.pid).join('\n');
    fs.writeFileSync(this.pidFilePath, pids, 'utf-8');
  }

  private removePidFile(): void {
    try {
      fs.unlinkSync(this.pidFilePath);
    } catch {
      // File may already be gone.
    }
  }
}

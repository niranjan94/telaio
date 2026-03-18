import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessManager } from '../process-manager.js';

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional test helper
const ANSI_RE = /\x1b\[[0-9;]*m/g;

describe('ProcessManager', () => {
  let manager: ProcessManager;

  afterEach(async () => {
    await manager?.stopAll();
  });

  describe('spawn and output', () => {
    it('spawns a process and captures labeled output', async () => {
      const lines: string[] = [];
      manager = new ProcessManager({
        processes: [{ name: 'echo', command: 'echo hello' }],
        onOutput: (line) => lines.push(line),
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const plain = lines.map((line) => line.replace(ANSI_RE, ''));
      expect(
        plain.some((line) => line.includes('[echo]') && line.includes('hello')),
      ).toBe(true);
    });

    it('prefixes stderr with the same label', async () => {
      const lines: string[] = [];
      manager = new ProcessManager({
        processes: [{ name: 'err', command: 'echo oops >&2' }],
        onOutput: (line) => lines.push(line),
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const plain = lines.map((line) => line.replace(ANSI_RE, ''));
      expect(
        plain.some((line) => line.includes('[err]') && line.includes('oops')),
      ).toBe(true);
    });

    it('pads process names to align output', async () => {
      const lines: string[] = [];
      manager = new ProcessManager({
        processes: [
          { name: 'api', command: 'echo short' },
          { name: 'consumer', command: 'echo long' },
        ],
        onOutput: (line) => lines.push(line),
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const plain = lines.map((line) => line.replace(ANSI_RE, ''));
      const apiLine = plain.find((line) => line.includes('short'));
      expect(apiLine).toMatch(/\[api\s+\]/);
    });
  });

  describe('stopAll', () => {
    it('kills the process and its children', async () => {
      manager = new ProcessManager({
        processes: [{ name: 'parent', command: 'sleep 60 & sleep 60 & wait' }],
        onOutput: () => {},
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(manager.isRunning).toBe(true);

      await manager.stopAll();
      expect(manager.isRunning).toBe(false);
    });

    it('handles already-exited processes gracefully', async () => {
      manager = new ProcessManager({
        processes: [{ name: 'fast', command: 'echo done' }],
        onOutput: () => {},
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 500));

      await manager.stopAll();
    });

    it('force-kills processes that ignore SIGTERM after timeout', async () => {
      manager = new ProcessManager({
        processes: [{ name: 'stubborn', command: "trap '' TERM; sleep 60" }],
        onOutput: () => {},
      });

      manager.startAll();
      await new Promise((resolve) => setTimeout(resolve, 300));

      await manager.stopAll();
      expect(manager.isRunning).toBe(false);
    }, 10_000);
  });

  describe('watchdog orphan cleanup', () => {
    it('kills child processes when parent PID dies', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telaio-watchdog-'));
      const childPidFile = path.join(tmpDir, 'child.pid');

      const script = [
        `const fs = require(${JSON.stringify('node:fs')});`,
        'const { spawn } = require("node:child_process");',
        'const wrapper = [',
        '  "sleep 60 &",',
        '  "CHILD=$!",',
        `  "echo $CHILD > ${childPidFile}",`,
        '  "while kill -0 " + process.pid + " 2>/dev/null; do",',
        '  "  sleep 0.5",',
        '  "done",',
        '  "kill -TERM -- -$$ 2>/dev/null",',
        '  "wait",',
        '].join("\\n");',
        'const child = spawn("/bin/sh", ["-c", wrapper], {',
        '  detached: true,',
        '  stdio: ["ignore", "pipe", "pipe"],',
        '});',
        'console.log(child.pid);',
        'setTimeout(() => process.exit(0), 500);',
      ].join('\n');

      const fakeParent = spawn(process.execPath, ['-e', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const output = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        fakeParent.stdout?.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        fakeParent.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        fakeParent.on('error', reject);
        fakeParent.on('close', (code) => {
          if (code === 0) {
            resolve(stdout.trim());
            return;
          }
          reject(new Error(stderr || `Fake parent exited with code ${code}`));
        });
      });

      const wrapperPid = Number.parseInt(output, 10);
      expect(wrapperPid).toBeGreaterThan(0);

      let childPid = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (fs.existsSync(childPidFile)) {
          childPid = Number.parseInt(fs.readFileSync(childPidFile, 'utf-8'), 10);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(childPid).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 2_000));

      const isAlive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      expect(isAlive(childPid)).toBe(false);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    }, 10_000);
  });

  describe('cleanupStale', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telaio-pm-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('kills stale process groups listed in PID file', async () => {
      const bg = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
      const stalePid = bg.pid;
      if (!stalePid) {
        throw new Error('Failed to start background process');
      }
      bg.unref();

      const pidFile = path.join(tmpDir, '.telaio-dev.pid');
      fs.writeFileSync(pidFile, `${stalePid}\n`, 'utf-8');

      const processManager = new ProcessManager({
        processes: [],
        cwd: tmpDir,
        pidFile,
      });

      processManager.cleanupStale();
      await new Promise((resolve) => setTimeout(resolve, 200));

      let alive = false;
      try {
        process.kill(-stalePid, 0);
        alive = true;
      } catch {
        // Expected.
      }

      expect(alive).toBe(false);
      expect(fs.existsSync(pidFile)).toBe(false);
    });

    it('handles missing PID file gracefully', () => {
      const processManager = new ProcessManager({
        processes: [],
        cwd: tmpDir,
        pidFile: path.join(tmpDir, '.telaio-dev.pid'),
      });

      processManager.cleanupStale();
    });

    it('handles already-dead PIDs in the file', () => {
      const pidFile = path.join(tmpDir, '.telaio-dev.pid');
      fs.writeFileSync(pidFile, '999999\n', 'utf-8');

      const processManager = new ProcessManager({
        processes: [],
        cwd: tmpDir,
        pidFile,
      });

      processManager.cleanupStale();
      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });
});

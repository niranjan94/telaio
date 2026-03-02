import { execSync } from 'node:child_process';
import type { Command } from 'commander';

/** Options for the build command. */
interface BuildOptions {
  outDir: string;
  dbTypes: boolean;
  genClient?: string;
  tscAlias: boolean;
  format: boolean;
  skipClean: boolean;
}

/** A single build step with a name and command to execute. */
interface BuildStep {
  name: string;
  command: string;
}

/**
 * Runs a single build step. Logs the step name, executes the command,
 * and aborts the process on failure.
 */
function runStep(step: BuildStep): void {
  console.log(`\n→ ${step.name}`);
  try {
    execSync(step.command, { stdio: 'inherit' });
  } catch {
    console.error(`\n✖ Build failed at step: ${step.name}`);
    process.exit(1);
  }
}

/**
 * Assembles the build pipeline from options. Each optional step is only
 * included when the corresponding flag is set.
 */
function assemblePipeline(options: BuildOptions): BuildStep[] {
  const steps: BuildStep[] = [];

  // 1. Clean output directory
  if (!options.skipClean) {
    steps.push({
      name: `Clean ${options.outDir}/`,
      command: `rm -rf ${options.outDir}`,
    });
  }

  // 2. Generate database types (optional, before compilation)
  if (options.dbTypes) {
    steps.push({
      name: 'Generate database types (kysely-codegen)',
      command: 'kysely-codegen',
    });
  }

  // 3. TypeScript compilation
  steps.push({
    name: 'Compile TypeScript',
    command: `tsc --outDir ${options.outDir}`,
  });

  // 4. Resolve path aliases (optional)
  if (options.tscAlias) {
    steps.push({
      name: 'Resolve path aliases (tsc-alias)',
      command: `tsc-alias --outDir ${options.outDir}`,
    });
  }

  // 5. Generate OpenAPI client (optional, after compilation)
  if (options.genClient) {
    steps.push({
      name: 'Generate OpenAPI client',
      command: `telaio gen-client --app ${options.genClient}`,
    });
  }

  // 6. Format output (optional)
  if (options.format) {
    steps.push({
      name: 'Format (biome)',
      command: 'biome check --write --unsafe',
    });
  }

  return steps;
}

/** Registers the `telaio build` CLI command. */
export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Run the sequential build pipeline')
    .option('--out-dir <dir>', 'Output directory', 'dist')
    .option('--db-types', 'Run kysely-codegen before compilation')
    .option(
      '--gen-client <app-path>',
      'Generate OpenAPI client after compilation (pass the app module path)',
    )
    .option('--tsc-alias', 'Run tsc-alias after tsc')
    .option('--format', 'Run biome format after everything')
    .option('--skip-clean', 'Skip rm -rf of the output directory')
    .action(async (options: BuildOptions) => {
      const steps = assemblePipeline(options);

      console.log(`Build pipeline (${steps.length} steps):`);
      for (const step of steps) {
        console.log(`  · ${step.name}`);
      }

      for (const step of steps) {
        runStep(step);
      }

      console.log('\n✔ Build complete.');
    });
}

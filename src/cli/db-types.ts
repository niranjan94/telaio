import { execSync } from 'node:child_process';
import path from 'node:path';
import type { Command } from 'commander';

import { resolveCliConfig } from './resolve-config.js';

/** Registers the `telaio db:types` command. */
export function registerDbTypesCommand(program: Command): void {
  program
    .command('db:types')
    .description(
      'Generate TypeScript types from the database schema using kysely-codegen',
    )
    .option('-o, --out-file <path>', 'Output file path', 'src/db/types.ts')
    .option('--camel-case', 'Use camelCase for column names')
    .option('--no-camel-case', 'Disable camelCase for column names')
    .option('--runtime-enums', 'Generate runtime enums', true)
    .option('--singularize', 'Singularize table names', true)
    .option('--config-file <path>', 'kysely-codegen config file path')
    .option('--watch', 'Watch migration files and regenerate')
    .action(
      async (options: {
        outFile: string;
        camelCase: boolean | undefined;
        runtimeEnums: boolean;
        singularize: boolean;
        configFile?: string;
        watch?: boolean;
      }) => {
        const cwd = process.cwd();
        const appConfig = await resolveCliConfig(cwd);

        // kysely-codegen reads DATABASE_URL from env
        if (appConfig.DATABASE_URL && !process.env.DATABASE_URL) {
          process.env.DATABASE_URL = appConfig.DATABASE_URL as string;
        }

        const args: string[] = ['kysely-codegen'];

        args.push('--out-file', options.outFile);

        // CLI flag takes precedence, then config, then default true
        const camelCase =
          options.camelCase ??
          (appConfig.DATABASE_CAMEL_CASE as boolean | undefined) ??
          true;
        if (camelCase) {
          args.push('--camel-case');
        }
        if (options.runtimeEnums) {
          args.push('--runtime-enums');
        }
        if (options.singularize) {
          args.push('--singularize');
        }
        if (options.configFile) {
          args.push('--config-file', options.configFile);
        }

        const command = args.join(' ');

        const generate = () => {
          console.log(`Running: ${command}`);
          try {
            execSync(command, { stdio: 'inherit' });
            console.log(`Types generated to ${options.outFile}`);
          } catch {
            console.error('Failed to generate database types.');
            console.error(
              "Make sure 'kysely-codegen' is installed: pnpm add -D kysely-codegen",
            );
            process.exit(1);
          }
        };

        if (options.watch) {
          let watcher: typeof import('@parcel/watcher');
          try {
            const mod = await import('@parcel/watcher');
            watcher = mod.default ?? mod;
          } catch {
            throw new Error(
              "telaio: --watch requires '@parcel/watcher'. Install it: pnpm add -D @parcel/watcher",
            );
          }

          // Initial generation
          generate();

          const migrationPaths = [
            'src/db/migrations',
            'migrations',
            'db/migrations',
          ];
          console.log('Watching migration files for changes...');
          let debounce: ReturnType<typeof setTimeout> | null = null;

          await watcher.subscribe(
            cwd,
            (_err, events) => {
              if (!events?.length) return;
              const relevant = events.some((e) => {
                const rel = path.relative(cwd, e.path);
                return migrationPaths.some(
                  (p) => rel.startsWith(`${p}${path.sep}`) || rel === p,
                );
              });
              if (!relevant) return;

              if (debounce) clearTimeout(debounce);
              debounce = setTimeout(() => {
                console.log(
                  'Migration changes detected, regenerating types...',
                );
                generate();
              }, 300);
            },
            { ignore: ['node_modules', '.git', 'dist'] },
          );

          await new Promise(() => {});
        } else {
          generate();
        }
      },
    );
}

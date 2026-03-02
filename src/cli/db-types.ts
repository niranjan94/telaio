import { execSync } from 'node:child_process';
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
    .option('--camel-case', 'Use camelCase for column names', true)
    .option('--runtime-enums', 'Generate runtime enums', true)
    .option('--singularize', 'Singularize table names', true)
    .option('--config-file <path>', 'kysely-codegen config file path')
    .action(
      async (options: {
        outFile: string;
        camelCase: boolean;
        runtimeEnums: boolean;
        singularize: boolean;
        configFile?: string;
      }) => {
        const appConfig = await resolveCliConfig(process.cwd());

        // kysely-codegen reads DATABASE_URL from env
        if (appConfig.DATABASE_URL && !process.env.DATABASE_URL) {
          process.env.DATABASE_URL = appConfig.DATABASE_URL as string;
        }

        const args: string[] = ['kysely-codegen'];

        args.push('--out-file', options.outFile);

        if (options.camelCase) {
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
      },
    );
}

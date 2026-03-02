#!/usr/bin/env node
// Register tsx/esm loader so TypeScript files can be imported at runtime
// (e.g. migration files, queue registries). Silently skipped if tsx not installed.
import 'tsx/esm';

import { Command } from 'commander';
import { registerBuildCommand } from './build.js';
import { registerConsumerCommand } from './consumer.js';
import { registerDbTypesCommand } from './db-types.js';
import { registerDevCommand } from './dev.js';
import { registerGenClientCommand } from './gen-client.js';
import { registerInitCommand } from './init.js';
import { registerMigrateCommand } from './migrate.js';

const program = new Command();

program
  .name('telaio')
  .description('CLI for the Telaio framework')
  .version('0.1.0');

registerInitCommand(program);
registerMigrateCommand(program);
registerGenClientCommand(program);
registerDbTypesCommand(program);
registerBuildCommand(program);
registerDevCommand(program);
registerConsumerCommand(program);

await program.parseAsync(process.argv);

#!/usr/bin/env node

import { Command } from 'commander';
import { registerDbTypesCommand } from './db-types.js';
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

await program.parseAsync(process.argv);

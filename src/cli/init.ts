import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import fastGlob from 'fast-glob';

/**
 * Resolves the absolute path to the `templates/` directory shipped with telaio.
 * Works both from source (development) and from dist (published package).
 */
function resolveTemplatesDir(): string {
  // From source: src/cli/init.ts -> ../../templates
  // From dist:   dist/cli/init.js -> ../../templates
  const candidates = [
    path.resolve(import.meta.dirname, '../../templates'),
    path.resolve(import.meta.dirname, '../../../templates'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Could not locate telaio templates directory. Please reinstall telaio.',
  );
}

/** Registers the `telaio init` command. */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new Telaio project')
    .argument('[directory]', 'Target directory', '.')
    .action(async (directory: string) => {
      const targetDir = path.resolve(directory);
      const templatesDir = resolveTemplatesDir();

      console.log(`Scaffolding Telaio project in ${targetDir}...`);

      const files = await fastGlob.async('**/*', {
        cwd: templatesDir,
        dot: true,
        onlyFiles: true,
      });

      for (const relativePath of files.sort()) {
        const sourcePath = path.join(templatesDir, relativePath);
        const destPath = path.join(targetDir, relativePath);
        const destDir = path.dirname(destPath);

        await fsp.mkdir(destDir, { recursive: true });

        // Don't overwrite existing files
        if (fs.existsSync(destPath)) {
          console.log(`  skip ${relativePath} (already exists)`);
          continue;
        }

        await fsp.copyFile(sourcePath, destPath);
        console.log(`  create ${relativePath}`);
      }

      console.log('\nDone! Next steps:');
      console.log('  pnpm add telaio');
      console.log('  pnpm add better-auth pg kysely redis');
      console.log('  pnpm add -D typescript @biomejs/biome');
      console.log('  tsx src/server.ts');
    });
}

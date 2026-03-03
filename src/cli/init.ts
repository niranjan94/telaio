import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

/** Template for the defineConfig declaration (CLI metadata + schema definition). */
const TELAIO_CONFIG_TEMPLATE = `import { defineConfig } from 'telaio/config';
import { z } from 'zod';

export default defineConfig({
  flags: { server: true, database: true, cache: true },
  extend: z.object({
    // Add your app-specific env vars here
  }),
});
`;

/** Template for the runtime config loader. */
const CONFIG_TEMPLATE = `import { loadConfigAsync } from 'telaio/config';
import definition from './telaio.config.js';

const config = await loadConfigAsync(definition);
export default config;
`;

/** Template for the main app builder file. */
const APP_TEMPLATE = `import { createApp } from 'telaio';
import config from './config.js';

/** Builds and configures the Fastify application. */
export async function buildApp(ephemeral = false) {
  const builder = createApp({ config })
    .withPlugins({
      cors: true,
      helmet: true,
    })
    .withSwagger({
      info: { title: 'My API', version: '1.0.0' },
    })
    .withApiDocs();

  if (ephemeral) {
    builder.asEphemeral();
  }

  return builder.build();
}
`;

/** Template for the server entry point. */
const SERVER_TEMPLATE = `import { buildApp } from './app.js';

const app = await buildApp();
await app.start();
`;

/** Template for the ping route. */
const PING_ROUTE_TEMPLATE = `import type { FastifyInstance } from 'fastify';

export default async function (fastify: FastifyInstance) {
  fastify.get('/ping', async () => {
    return { pong: true };
  });
}
`;

/** Template for tsconfig.json. */
const TSCONFIG_TEMPLATE = `{
  "extends": "telaio/tsconfig",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`;

/** Template for biome.json. */
const BIOME_TEMPLATE = `{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single"
    }
  }
}
`;

/** Template for .env file. */
const ENV_TEMPLATE = `APP_NAME=MyApp
NODE_ENV=development
API_LISTEN_PORT=4001
DATABASE_URL=postgresql://localhost/myapp
REDIS_URL=redis://localhost:6379
`;

/** Scaffolding file map. */
const FILES: Record<string, string> = {
  'src/telaio.config.ts': TELAIO_CONFIG_TEMPLATE,
  'src/config.ts': CONFIG_TEMPLATE,
  'src/app.ts': APP_TEMPLATE,
  'src/server.ts': SERVER_TEMPLATE,
  'src/routes/v1/ping/actions.ts': PING_ROUTE_TEMPLATE,
  'src/schemas/.gitkeep': '',
  'src/services/.gitkeep': '',
  'src/db/migrations/.gitkeep': '',
  'tsconfig.json': TSCONFIG_TEMPLATE,
  'biome.json': BIOME_TEMPLATE,
  '.env': ENV_TEMPLATE,
};

/** Registers the `telaio init` command. */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new Telaio project')
    .argument('[directory]', 'Target directory', '.')
    .action(async (directory: string) => {
      const targetDir = path.resolve(directory);

      console.log(`Scaffolding Telaio project in ${targetDir}...`);

      for (const [relativePath, content] of Object.entries(FILES)) {
        const fullPath = path.join(targetDir, relativePath);
        const dir = path.dirname(fullPath);

        await fs.mkdir(dir, { recursive: true });

        // Don't overwrite existing files
        try {
          await fs.access(fullPath);
          console.log(`  skip ${relativePath} (already exists)`);
          continue;
        } catch {
          // File doesn't exist — create it
        }

        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`  create ${relativePath}`);
      }

      console.log('\nDone! Next steps:');
      console.log('  pnpm add telaio');
      console.log('  pnpm add -D typescript @biomejs/biome');
      console.log('  pnpm add kysely pg redis # for database/cache');
      console.log('  tsx src/server.ts');
    });
}

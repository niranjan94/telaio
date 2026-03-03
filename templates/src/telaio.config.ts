import { defineConfig } from 'telaio/config';
import { z } from 'zod';

export default defineConfig({
  flags: { server: true, database: true, cache: true },
  extend: z.object({
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url().optional(),
    FRONTEND_URL: z.url().default('http://localhost:3000'),
  }),
});

# Telaio

TypeScript-first Fastify 5 framework with a builder pattern and phantom types for compile-time feature safety. ESM-only, Node >= 20.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm run build` | Clean + compile (`rm -rf dist && tsc`) |
| `pnpm run format` | Auto-format with Biome |
| `pnpm run test` | Lint + unit tests (107 tests) |
| `pnpm run test:integration` | Integration tests with mocked deps (20 tests) |
| `pnpm run test:types` | Compile-time type tests (30 tests) |
| `pnpm run test:e2e` | E2E with testcontainers — requires Docker (14 tests) |
| `pnpm run test:all` | All four suites sequentially |

**Quality gate after every change:** `pnpm run format && pnpm run build && pnpm run test && pnpm run test:integration`

## Architecture

```
src/
  builder.ts          # AppBuilder — fluent API, phantom-typed features
  types.ts            # TelaioApp<F, TSession, TConfig> conditional type
  index.ts            # Public API re-exports
  config/             # Composable Zod config with module flags
  db/                 # createPool, createDatabase, Kysely migrations
  cache/              # Redis wrapper with graceful disabled mode
  queue/              # pg-boss typed producer/consumer
  auth/               # AuthAdapter<TSession> + Fastify plugin
  email/              # React Email sender via SES
  s3/                 # S3 client factory
  logger/             # Pino logger factory
  schema/             # TypeBox schema helpers
  server/             # Fastify plugins, hooks, Swagger, Scalar
  cli/                # CLI commands: init, migrate, build, dev, gen-client, db:types
  errors/             # Typed HTTP errors (RequestError subclasses)
```

## Code Style

- **Formatter/Linter:** Biome — 2-space indent, single quotes, organize imports
- **Files:** kebab-case
- **Language:** TypeScript ESM (`"type": "module"`)
- **Tests:** Unit tests colocated in `src/*/__tests__/`, integration/e2e/type-tests in `tests/`

## Key Patterns

- **Builder phantom types:** `withDatabase()` returns `AppBuilder<F & { database: true }, ...>` — the built `TelaioApp` conditionally exposes `pool`/`db`/`cache`/`queue` based on feature flags.
- **Optional peer deps:** All heavy deps (kysely, pg, redis, pg-boss, AWS SDK, etc.) are optional peer dependencies loaded via dynamic `import()` with clear error messages.
- **Standalone factories:** `createPool`, `createDatabase`, `createCache` work independently of the builder — used to resolve auth chicken-and-egg (config → pool → auth lib → builder receives existing instances).
- **Queue registry:** `satisfies Record<string, QueueJobHandler>` for type inference; `JobDataFor<TQueues, Name>` extracts payload types.

## Gotchas

- `db.destroy()` (Kysely) also ends the underlying pg Pool via PostgresDialect — never call both `db.destroy()` and `pool.end()`.
- Vitest 4 type tests use `vitest run --typecheck.only` (not the old `vitest typecheck` subcommand).
- E2E tests require Docker running. If Docker is unavailable, tests skip gracefully via `describe.skipIf(skipE2e)`.
- Config's `InferConfig<Flags, never>` collapses to `never` in Zod v4 — use `loadConfig()` with defaults instead of the generic directly.

## Package Manager

**pnpm** — always use `pnpx` instead of `npx`.

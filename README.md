# telaio

A TypeScript-first Fastify 5 framework with a builder pattern and phantom types for compile-time feature safety.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Builder Pattern and Phantom Types](#builder-pattern-and-phantom-types)
  - [Configuration](#configuration)
  - [Project Conventions](#project-conventions)
- [Features](#features)
  - [Database](#database)
  - [Cache](#cache)
  - [Queue](#queue)
  - [Auth](#auth)
  - [Email](#email)
  - [S3](#s3)
  - [Errors](#errors)
  - [Schema](#schema)
  - [Server and Plugins](#server-and-plugins)
  - [Logger](#logger)
- [CLI Reference](#cli-reference)
- [Testing](#testing)
- [License](#license)

---

## Philosophy

Telaio is deliberately opinionated. It selects the libraries, the patterns, and the project layout. There are no adapters for alternative ORMs, alternative loggers, or alternative validation libraries. The stack is fixed: PostgreSQL via Kysely, Redis, pg-boss, Pino, Zod, TypeBox, and AWS SDK where applicable.

The tradeoff is explicit: in exchange for accepting these choices, you get deep type integration, a consistent project structure, and zero configuration overhead for the decisions the framework has already made. If you need to swap out Kysely for Prisma or Redis for Memcached, this is not the right tool.

The centerpiece of the design is phantom types on the builder. Enabling a feature changes the TypeScript type of the built application. Calling `app.db` without having called `.withDatabase()` is a compile-time error, not a runtime one. The type system enforces that your wiring is correct before the process starts.

TypeScript is required. ESM is the only module format. Node 20 or later is the minimum runtime. These constraints are not negotiable.

---

## Requirements

- Node >= 20
- TypeScript (project must be ESM, `"type": "module"` in `package.json`)
- pnpm (recommended)
- Docker (only required for E2E tests)

---

## Installation

```bash
pnpm add telaio
```

Telaio uses optional peer dependencies. Install only the packages you need for the features you enable:

| Feature | Peer Dependencies |
|---------|-------------------|
| Database | `pg`, `kysely`, `pg-native` (optional) |
| Cache | `redis` |
| Queue | `pg-boss` |
| Email | `@aws-sdk/client-ses`, `@react-email/components` |
| S3 | `@aws-sdk/client-s3` |
| Auth (better-auth) | `better-auth`, `@daveyplate/better-auth-ui` (optional, for email templates) |
| API Docs | `@scalar/api-reference` |

---

## Quick Start

Scaffold a new project:

```bash
pnpx telaio init my-app
cd my-app
pnpm install
```

This generates a complete project structure with config, routes, schemas, and a pre-wired builder. For an existing project, the minimal setup looks like this:

```typescript
import { createApp, loadConfig } from 'telaio';
import { createLogger } from 'telaio/logger';

const config = loadConfig({
  modules: { database: true, cache: true },
});

const logger = createLogger({ level: 'info' });

const app = await createApp({ config, logger })
  .withDatabase()
  .withCache()
  .withPlugins({ cors: true, helmet: true })
  .withSwagger({ info: { title: 'My API', version: '1.0.0' } })
  .withApiDocs()
  .build();

await app.start();
```

---

## Core Concepts

### Builder Pattern and Phantom Types

`createApp()` returns an `AppBuilder`. Each `.with*()` call returns a new builder with an updated phantom type parameter tracking which features are enabled. When you call `.build()`, the resulting `TelaioApp` only exposes the properties corresponding to features you have enabled.

```typescript
// Without .withDatabase(), accessing app.pool is a compile error:
const app = await createApp().build();
app.pool; // Error: Property 'pool' does not exist on type 'TelaioApp<DefaultFeatures, ...>'

// With .withDatabase(), it is available and fully typed:
const app = await createApp().withDatabase().build();
app.pool; // pg.Pool
app.db;   // Kysely<unknown>
```

The same applies to `app.cache`, `app.queue`, and `app.auth`. This prevents the class of bugs where a feature is conditionally enabled by environment but unconditionally accessed in code.

### Configuration

Config is composed from module schemas using Zod. Define your config in `telaio.config.ts`:

```typescript
import { defineConfig } from 'telaio/config';
import { z } from 'zod';

export default defineConfig({
  modules: { database: true, cache: true, queue: true },
  extend: z.object({
    FRONTEND_URL: z.url().default('http://localhost:3000'),
    APP_SECRET: z.string(),
  }),
});
```

Then load it:

```typescript
import { loadConfigAsync } from 'telaio/config';
import definition from './telaio.config.js';

const config = await loadConfigAsync(definition);
// Type is: CoreConfig & DatabaseConfig & CacheConfig & QueueConfig & { FRONTEND_URL: string; APP_SECRET: string }
```

The CLI (`telaio migrate`, `telaio consumer`, etc.) discovers and uses `telaio.config.ts` automatically.

### Project Conventions

By default, the framework expects:

- Routes in `src/routes/` — auto-discovered and loaded by `@fastify/autoload`
- TypeBox schemas in `src/schemas/` — auto-registered with Fastify on startup

Both can be disabled:

```typescript
createApp()
  .withPlugins({ autoload: false })
  .withSchemas(false)
```

---

## Features

### Database

PostgreSQL via `pg` and Kysely. `createPool` and `createDatabase` are standalone factories, available independently of the builder for cases where you need a pool before the builder is constructed (e.g., initializing an auth library).

```typescript
import { createPool, createDatabase } from 'telaio/db';

const pool = createPool({ connectionString: config.DATABASE_URL }, logger);
const db = createDatabase(pool);
```

Query helpers for common patterns:

```typescript
import { applyFilter, sortPaginateQuery } from 'telaio/db';

const query = db.selectFrom('users').selectAll();
const filtered = applyFilter(query, { role: 'admin' });
const paginated = sortPaginateQuery(filtered, { sort: 'created_at', limit: 20, skip: 0 });
```

**Note:** `db.destroy()` closes the underlying pool via `PostgresDialect`. Never call both `db.destroy()` and `pool.end()`.

### Cache

Redis with graceful disabled mode. If Redis is unreachable or `REDIS_ENABLED` is false, all cache operations silently no-op. The application continues without cache; no errors are thrown.

```typescript
await app.cache.set('user:1', JSON.stringify(user), 3600); // TTL in seconds
const value = await app.cache.get('user:1');
await app.cache.delete('user:1');
```

JSON record helpers:

```typescript
await app.cache.setRecord('session:abc', sessionData, 900);
const session = await app.cache.getRecord('session:abc');
```

### Queue

pg-boss (PostgreSQL-backed) with a typed job registry. The registry maps job names to handlers; the handler signature infers the data type, which is then enforced at the send call site.

**Define a registry:**

```typescript
import type { Job } from 'pg-boss';
import type { QueueJobHandler } from 'telaio/queue';

export const queues = {
  sendWelcomeEmail: (async (jobs: Job<{ userId: string; email: string }>[]) => {
    for (const job of jobs) {
      await sendEmail(job.data.email);
    }
  }) satisfies QueueJobHandler<{ userId: string; email: string }>,
};
```

**Wire into the builder:**

```typescript
const app = await createApp({ config, logger })
  .withDatabase()
  .withQueues(queues)
  .build();
```

**Send jobs (TypeScript validates data shape):**

```typescript
await app.queue.send('sendWelcomeEmail', { userId: 'u1', email: 'a@example.com' }); // ok
await app.queue.send('sendWelcomeEmail', { userId: 'u1' }); // compile error: missing 'email'
```

**Run the consumer as a separate process:**

```bash
telaio consumer --registry src/queues.ts
```

### Auth

Telaio defines an `AuthAdapter<TSession>` interface. You implement it for your auth library of choice, then pass it to the builder. A first-party adapter for better-auth is included.

```typescript
interface AuthAdapter<TSession> {
  getSession(headers: Headers): Promise<TSession | null>;
  handler?: (request: Request) => Promise<Response>;
  validateScope?: (session: TSession, scope: string) => boolean;
  validateRole?: (session: TSession, roles: string[]) => boolean;
}
```

Protect routes with `withAuth`:

```typescript
import { withAuth } from 'telaio/auth';

app.fastify.get('/me', {
  ...withAuth(),
  handler: async (req) => ({ session: req.authSession }),
});

app.fastify.get('/admin', {
  ...withAuth({ roles: ['admin'] }),
  handler: async (req) => ({ ok: true }),
});

app.fastify.get('/resource/:id', {
  ...withAuth({ authorize: (session, req) => session.userId === req.params.id }),
  handler: async (req) => ({ ok: true }),
});
```

Augment the module to type `role` and `scope` values:

```typescript
declare module 'telaio/auth' {
  interface AuthGuardTypes {
    role: 'admin' | 'user';
    scope: 'read:users' | 'write:users';
  }
}
```

**better-auth integration** is available at `telaio/auth/better-auth` and provides a pre-built adapter, session hydration hooks, and React Email templates for verification and magic link emails.

### Email

Send React Email templates via AWS SES:

```typescript
import { sendReactEmail } from 'telaio/email';
import { WelcomeEmail } from './emails/welcome.js';

await sendReactEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  component: <WelcomeEmail name="Alice" />,
  config,
});
```

Requires peer deps: `@aws-sdk/client-ses`, `@react-email/components`.

### S3

S3-compatible storage client:

```typescript
import { createS3Client } from 'telaio/s3';

const s3 = createS3Client(config);
// Use with @aws-sdk/client-s3 commands directly
```

Supports custom endpoints for MinIO and other S3-compatible services via `S3_ENDPOINT` config key. Requires peer dep: `@aws-sdk/client-s3`.

### Errors

A hierarchy of typed HTTP errors that the framework's error handler converts to consistent JSON responses:

```typescript
import {
  BadRequestError,    // 400
  UnauthorizedError,  // 401
  ForbiddenError,     // 403
  NotFoundError,      // 404
  PayloadTooLargeError, // 413
} from 'telaio/errors';

// In any route handler:
throw new NotFoundError('User not found');
```

Response format for known errors:

```json
{ "status": "error", "code": "NOT_FOUND", "message": "User not found" }
```

Unknown errors return a 500 with a `logId` for log correlation:

```json
{ "status": "error", "code": "ERROR", "message": "An error occurred", "logId": "..." }
```

### Schema

TypeBox helpers for building Fastify route schemas. Schemas placed in `src/schemas/` are auto-registered on startup.

```typescript
import { type Static, Type } from '@sinclair/typebox';
import { AutoRef, Paginated, Nullable, Timestamp } from 'telaio/schema';

export const UserSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: Type.String({ format: 'email' }),
    name: Nullable(Type.String()),
    createdAt: Timestamp,
  },
  { $id: 'User' },
);

export type User = Static<typeof UserSchema>;

// Wrap a list in a paginated envelope
export const UserListSchema = Paginated(UserSchema);
```

Use `AutoRef` in route responses to emit `$ref` instead of inlining the schema, avoiding fast-json-stringify duplication:

```typescript
app.fastify.get('/users', {
  schema: { response: { 200: AutoRef(UserListSchema) } },
  handler: async (req) => {
    return { data: users, meta: { total: 100, skip: 0, limit: 20 } };
  },
});
```

Built-in schemas: `SortPaginationParamsSchema`, `PaginationMetaSchema`, error response schemas (BadRequest, Unauthorized, Forbidden, NotFound).

### Server and Plugins

Optional Fastify plugins, enabled via `.withPlugins()`:

| Key | Plugin | Notes |
|-----|--------|-------|
| `cors` | `@fastify/cors` | Accepts boolean or CORS options |
| `helmet` | `@fastify/helmet` | Accepts boolean or Helmet options |
| `cookie` | `@fastify/cookie` | Cookie parsing |
| `compress` | `@fastify/compress` | Response compression |
| `multipart` | `@fastify/multipart` | File uploads |
| `websocket` | `@fastify/websocket` | WebSocket support |
| `sse` | `fastify-sse-v2` | Server-sent events |
| `autoload` | `@fastify/autoload` | Route auto-discovery from `src/routes/` (default: on) |

Swagger is registered via `.withSwagger()` and is always available if called. Interactive API docs (Scalar) are enabled via `.withApiDocs()`.

### Logger

Pino logger with optional pretty-printing:

```typescript
import { createLogger } from 'telaio/logger';

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  pretty: process.env.NODE_ENV !== 'production',
});
```

Auto-detects `pino-pretty` availability. Includes serializers for `err`, `error`, and `e` fields.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `telaio init <path>` | Scaffold a new Telaio project |
| `telaio build` | Clean build (`rm -rf dist && tsc`) |
| `telaio dev` | Watch mode (`tsc --watch`) |
| `telaio migrate create <name>` | Create a new migration file |
| `telaio migrate` | Run pending migrations |
| `telaio consumer` | Start the queue consumer process |
| `telaio gen-client` | Generate an OpenAPI client via `@hey-api/openapi-ts` |
| `telaio db:types` | Generate Kysely types from the database via `kysely-codegen` |

All commands that require database access read config from `telaio.config.ts` in the project root.

---

## Testing

The framework uses four test suites:

| Suite | Command | Description |
|-------|---------|-------------|
| Unit | `pnpm run test:unit` | Colocated tests in `src/**/__tests__/` |
| Integration | `pnpm run test:integration` | Builder and module tests with mocked dependencies |
| Type | `pnpm run test:types` | Compile-time phantom type assertions via Vitest's type-checking mode |
| E2E | `pnpm run test:e2e` | Full app lifecycle against real PostgreSQL and Redis via testcontainers |

E2E tests require Docker. If Docker is not available, the E2E suite skips gracefully.

**Quality gate** (run after every change):

```bash
pnpm run format && pnpm run build && pnpm run test && pnpm run test:integration
```

---

## License

MIT. See [LICENSE](./LICENSE).

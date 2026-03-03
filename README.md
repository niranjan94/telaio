[![Test](https://github.com/niranjan94/telaio/actions/workflows/test.yml/badge.svg)](https://github.com/niranjan94/telaio/actions/workflows/test.yml) [![npm version](https://img.shields.io/npm/v/telaio.svg)](https://www.npmjs.com/package/telaio)

# Telaio

A TypeScript-first Fastify 5 framework with a builder pattern and phantom types for compile-time feature safety.

## Philosophy

Telaio is deliberately opinionated. It selects the libraries, the patterns, and the project layout. There are no adapters for alternative ORMs, alternative loggers, or alternative validation libraries. The stack is fixed: PostgreSQL via Kysely, Redis, pg-boss, Pino, Zod, TypeBox, and AWS SDK where applicable.

The tradeoff is explicit: in exchange for accepting these choices, you get deep type integration, a consistent project structure, and zero configuration overhead for the decisions the framework has already made. If you need to swap out Kysely for Prisma or Redis for Memcached, this is not the right tool.

The centerpiece of the design is phantom types on the builder. Enabling a feature changes the TypeScript type of the built application. Calling `app.db` without having called `.withDatabase()` is a compile-time error, not a runtime one. The type system enforces that your wiring is correct before the process starts.

This design has a second-order benefit: it makes your codebase dramatically easier for AI coding agents to work with. A fixed stack means an LLM cannot make wrong library choices. Phantom types and Zod config validation catch its mistakes at compile time, not runtime. The entire application's infrastructure story fits in a single builder chain -- not scattered across dozens of config and module files. The surface area an AI agent needs to understand shrinks to your business logic.

TypeScript is required. ESM is the only module format. Node 20 or later is the minimum runtime.

## Install

```sh
pnpm add telaio
```

## Documentation

Full docs at **https://telaio.niranjan.io** -- quick links:

- [Quick Start](https://telaio.niranjan.io/docs/introduction/quick-start)
- [Builder Pattern & Phantom Types](https://telaio.niranjan.io/docs/core-concepts/builder-pattern)
- [Configuration](https://telaio.niranjan.io/docs/core-concepts/configuration)
- [Modules (Database, Cache, Queue, Auth, Email, S3)](https://telaio.niranjan.io/docs/modules)
- [CLI Reference](https://telaio.niranjan.io/docs/cli)

## License

MIT

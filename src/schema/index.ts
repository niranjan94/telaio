import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import type { FastifyInstance } from 'fastify';
import {
  ObjectOptions,
  type Static,
  type TEnum,
  type TObjectOptions,
  type TSchema,
  type TTypeScriptEnumLike,
  Type,
} from 'typebox';

/**
 * Wraps a schema with a $ref pointer using its $id.
 * Prevents fast-json-stringify from consuming the $id field
 * by emitting a JSON Schema $ref reference instead.
 */
export function AutoRef<T extends TSchema>(schema: T) {
  // biome-ignore lint/suspicious/noExplicitAny: required due to typebox internals
  const $id = ObjectOptions(schema as any).$id;
  if (!$id) {
    throw new Error('Schema must have pre-set $id to be auto-referenced');
  }
  return Type.Unsafe<Static<T>>(Type.Ref($id));
}

/** A date-time string schema (ISO 8601 format). */
export const Timestamp = Type.Unsafe<Date>({
  type: 'string',
  format: 'date-time',
});

/**
 * Converts a TypeScript enum-like object into a TypeBox enum schema.
 * Uses Object.values() to extract enum values for the schema.
 */
export function PlainEnum<Enum extends TTypeScriptEnumLike>(
  enumObj: Enum,
): TEnum<Enum[keyof Enum][]> {
  return Type.Enum(Object.values(enumObj) as Enum[keyof Enum][]);
}

/**
 * Creates a union type of the given schema or null.
 * Useful for representing optional database columns.
 */
export function Nullable<Schema extends TSchema>(schema: Schema) {
  return Type.Union([schema, Type.Null()]);
}

/**
 * Creates an optional literal type with a default value.
 * Useful for discriminated unions or type name fields in schemas.
 */
export function TypeName<T extends string>(typeName: T) {
  return Type.Optional(Type.Literal(typeName, { default: typeName }));
}

/** Schema for sort/pagination query parameters. */
export const SortPaginationParamsSchema = Type.Object(
  {
    sort: Type.Optional(Type.String()),
    limit: Type.Optional(
      Type.Number({ default: 10, maximum: 100, minimum: 1 }),
    ),
    skip: Type.Optional(Type.Number({ default: 0, minimum: 0 })),
  },
  { $id: 'SortPaginationParams' },
);

/** Schema for pagination metadata in responses. */
export const PaginationMetaSchema = Type.Object(
  {
    total: Type.Number(),
    skip: Type.Number(),
    limit: Type.Number(),
  },
  { $id: 'PaginationMeta' },
);

export type SortPaginationParams = Static<typeof SortPaginationParamsSchema>;
export type PaginationMeta = Static<typeof PaginationMetaSchema>;

/**
 * Generates a paginated response schema wrapping an array of items with metadata.
 * The data schema must have a $id set for AutoRef to work.
 */
export function Paginated<DataSchemaType extends TSchema>(
  DataSchema: DataSchemaType,
  options?: TObjectOptions,
) {
  return Type.Object(
    {
      data: Type.Array(AutoRef(DataSchema)),
      meta: AutoRef(PaginationMetaSchema),
    },
    options,
  );
}

/** Standard error response schema fields. */
function errorResponseSchema(
  $id: string,
  description: string,
  defaults: { code: string; message: string },
) {
  return Type.Object(
    {
      status: Type.String({ default: 'error' }),
      code: Type.String({ default: defaults.code }),
      message: Type.String({ default: defaults.message }),
    },
    { $id, description },
  );
}

/** Generic error response schema (500). */
export const GenericErrorResponseSchema = errorResponseSchema(
  'GenericErrorResponse',
  'An error has occurred.',
  { code: 'ERROR', message: 'An error occurred' },
);

/** Bad request error response schema (400). */
export const BadRequestErrorResponseSchema = errorResponseSchema(
  'BadRequestErrorResponse',
  'Invalid request parameters.',
  { code: 'BAD_REQUEST', message: 'Invalid data in request' },
);

/** Unauthorized error response schema (401). */
export const UnauthorizedResponseSchema = errorResponseSchema(
  'UnauthorizedResponse',
  'Authorization token is missing or invalid.',
  { code: 'UNAUTHORIZED', message: 'Unauthorized' },
);

/** Forbidden error response schema (403). */
export const ForbiddenResponseSchema = errorResponseSchema(
  'ForbiddenResponse',
  'Request forbidden.',
  {
    code: 'FORBIDDEN',
    message: 'You do not have access to perform this action.',
  },
);

/** Not found error response schema (404). */
export const NotFoundResponseSchema = errorResponseSchema(
  'NotFoundResponse',
  'Resource not found.',
  { code: 'NOT_FOUND', message: 'Resource not found' },
);

/** Payload too large error response schema (413). */
export const PayloadTooLargeResponseSchema = errorResponseSchema(
  'PayloadTooLargeResponse',
  'Request body exceeds allowed size.',
  { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
);

/** Validation error response schema (422). */
export const ValidationErrorResponseSchema = Type.Object(
  {
    status: Type.String({ default: 'error' }),
    code: Type.String({ default: 'UNPROCESSABLE_ENTITY' }),
    message: Type.String({ default: 'Validation failed' }),
    validation: Type.Array(
      Type.Object({
        message: Type.String(),
        instancePath: Type.Optional(Type.String()),
        keyword: Type.Optional(Type.String()),
      }),
    ),
    validationContext: Type.Optional(Type.String()),
  },
  { $id: 'ValidationErrorResponse', description: 'Validation failed.' },
);

/** Too many requests error response schema (429). */
export const TooManyRequestsResponseSchema = errorResponseSchema(
  'TooManyRequestsResponse',
  'Rate limit exceeded.',
  { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
);

export type GenericErrorResponse = Static<typeof GenericErrorResponseSchema>;
export type BadRequestErrorResponse = Static<
  typeof BadRequestErrorResponseSchema
>;
export type UnauthorizedResponse = Static<typeof UnauthorizedResponseSchema>;
export type ForbiddenResponse = Static<typeof ForbiddenResponseSchema>;
export type NotFoundResponse = Static<typeof NotFoundResponseSchema>;
export type PayloadTooLargeResponse = Static<
  typeof PayloadTooLargeResponseSchema
>;
export type ValidationErrorResponse = Static<
  typeof ValidationErrorResponseSchema
>;
export type TooManyRequestsResponse = Static<
  typeof TooManyRequestsResponseSchema
>;

/**
 * Auto-registers all TypeBox schemas from a directory into a Fastify instance.
 * Scans for exports ending in 'Schema', auto-generates $id if missing,
 * and registers them with fastify.addSchema().
 */
export async function registerSchemas(
  fastify: FastifyInstance,
  schemasDir: string,
) {
  if (!fs.existsSync(schemasDir)) {
    throw new Error(
      `Schemas directory not found: ${schemasDir}. Create the directory or call .withSchemas(false) to disable.`,
    );
  }

  const pattern = `${fastGlob.convertPathToPattern(schemasDir)}/**/*.(js|ts)`;
  const files = await fastGlob.async([pattern], {
    ignore: ['**/utils.ts', '**/utils.js', '**/index.ts', '**/index.js'],
  });

  for (const file of files) {
    const relativePath = path
      .relative(schemasDir, file)
      .replaceAll(path.win32.sep, path.posix.sep);

    const schemas = await import(path.resolve(schemasDir, relativePath));
    for (const schemaName of Object.keys(schemas)) {
      if (!schemaName.endsWith('Schema')) continue;

      const schema = schemas[schemaName];
      if (typeof schema === 'function') continue;

      if (!schema.$id) {
        schema.$id = schemaName.replace(/Schema$/, '');
      }

      try {
        fastify.addSchema(schema);
      } catch (e) {
        fastify.log.error(e, `Error loading schema ${relativePath}`);
      }
    }
  }
}

/**
 * Registers telaio's built-in schemas (pagination, error responses) into a Fastify instance.
 * These are always registered regardless of user schema directory.
 */
export async function registerBuiltinSchemas(fastify: FastifyInstance) {
  const builtins = [
    SortPaginationParamsSchema,
    PaginationMetaSchema,
    GenericErrorResponseSchema,
    BadRequestErrorResponseSchema,
    UnauthorizedResponseSchema,
    ForbiddenResponseSchema,
    NotFoundResponseSchema,
    PayloadTooLargeResponseSchema,
    ValidationErrorResponseSchema,
    TooManyRequestsResponseSchema,
  ];

  for (const schema of builtins) {
    try {
      fastify.addSchema(schema);
    } catch {
      // Schema might already be registered
    }
  }
}

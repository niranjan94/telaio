import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';

import {
  AutoRef,
  BadRequestErrorResponseSchema,
  ForbiddenResponseSchema,
  GenericErrorResponseSchema,
  NotFoundResponseSchema,
  Nullable,
  Paginated,
  PaginationMetaSchema,
  PayloadTooLargeResponseSchema,
  PlainEnum,
  registerSchemas,
  SortPaginationParamsSchema,
  Timestamp,
  TooManyRequestsResponseSchema,
  TypeName,
  UnauthorizedResponseSchema,
  ValidationErrorResponseSchema,
} from '../index.js';

describe('AutoRef', () => {
  it('creates a $ref for a schema with $id', () => {
    const schema = Type.Object({ name: Type.String() }, { $id: 'TestSchema' });
    const ref = AutoRef(schema);
    expect(ref).toBeDefined();
    expect(ref.$ref).toBe('TestSchema');
  });

  it('throws if schema has no $id', () => {
    const schema = Type.Object({ name: Type.String() });
    expect(() => AutoRef(schema)).toThrow(
      'Schema must have pre-set $id to be auto-referenced',
    );
  });
});

describe('Timestamp', () => {
  it('has string type with date-time format', () => {
    expect(Timestamp.type).toBe('string');
    expect(Timestamp.format).toBe('date-time');
  });
});

describe('PlainEnum', () => {
  it('creates a TypeBox enum from a TS enum', () => {
    enum Color {
      Red = 'red',
      Blue = 'blue',
    }
    const schema = PlainEnum(Color);
    expect(schema).toBeDefined();
    // The enum schema should exist with the right type
    expect(JSON.stringify(schema)).toContain('red');
    expect(JSON.stringify(schema)).toContain('blue');
  });
});

describe('Nullable', () => {
  it('creates a union of schema and null', () => {
    const schema = Nullable(Type.String());
    expect(schema.anyOf).toBeDefined();
    expect(schema.anyOf).toHaveLength(2);
  });
});

describe('TypeName', () => {
  it('creates an optional literal with default', () => {
    const schema = TypeName('myType');
    expect(schema).toBeDefined();
  });
});

describe('SortPaginationParamsSchema', () => {
  it('has $id set', () => {
    expect(SortPaginationParamsSchema.$id).toBe('SortPaginationParams');
  });

  it('has sort, limit, and skip properties', () => {
    expect(SortPaginationParamsSchema.properties).toHaveProperty('sort');
    expect(SortPaginationParamsSchema.properties).toHaveProperty('limit');
    expect(SortPaginationParamsSchema.properties).toHaveProperty('skip');
  });
});

describe('PaginationMetaSchema', () => {
  it('has $id set', () => {
    expect(PaginationMetaSchema.$id).toBe('PaginationMeta');
  });

  it('has total, skip, and limit properties', () => {
    expect(PaginationMetaSchema.properties).toHaveProperty('total');
    expect(PaginationMetaSchema.properties).toHaveProperty('skip');
    expect(PaginationMetaSchema.properties).toHaveProperty('limit');
  });
});

describe('Paginated', () => {
  it('creates a paginated wrapper schema', () => {
    const itemSchema = Type.Object({ id: Type.String() }, { $id: 'TestItem' });
    const paginated = Paginated(itemSchema, { $id: 'PaginatedTestItem' });
    expect(paginated.properties).toHaveProperty('data');
    expect(paginated.properties).toHaveProperty('meta');
    expect(paginated.$id).toBe('PaginatedTestItem');
  });
});

describe('registerSchemas', () => {
  it('throws when the schemas directory does not exist', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock fastify instance
    const fakeFastify = {} as any;
    await expect(
      registerSchemas(fakeFastify, '/nonexistent/schemas/directory'),
    ).rejects.toThrow('Schemas directory not found');
  });
});

describe('Error response schemas', () => {
  it('all have $id set', () => {
    expect(GenericErrorResponseSchema.$id).toBe('GenericErrorResponse');
    expect(BadRequestErrorResponseSchema.$id).toBe('BadRequestErrorResponse');
    expect(UnauthorizedResponseSchema.$id).toBe('UnauthorizedResponse');
    expect(ForbiddenResponseSchema.$id).toBe('ForbiddenResponse');
    expect(NotFoundResponseSchema.$id).toBe('NotFoundResponse');
    expect(PayloadTooLargeResponseSchema.$id).toBe('PayloadTooLargeResponse');
    expect(ValidationErrorResponseSchema.$id).toBe('ValidationErrorResponse');
    expect(TooManyRequestsResponseSchema.$id).toBe('TooManyRequestsResponse');
  });

  it('all have status, code, and message properties', () => {
    for (const schema of [
      GenericErrorResponseSchema,
      BadRequestErrorResponseSchema,
      UnauthorizedResponseSchema,
      ForbiddenResponseSchema,
      NotFoundResponseSchema,
      PayloadTooLargeResponseSchema,
      ValidationErrorResponseSchema,
      TooManyRequestsResponseSchema,
    ]) {
      expect(schema.properties).toHaveProperty('status');
      expect(schema.properties).toHaveProperty('code');
      expect(schema.properties).toHaveProperty('message');
    }
  });

  it('ValidationErrorResponseSchema has validation array and optional validationContext', () => {
    expect(ValidationErrorResponseSchema.properties).toHaveProperty(
      'validation',
    );
    expect(ValidationErrorResponseSchema.properties).toHaveProperty(
      'validationContext',
    );
    expect(ValidationErrorResponseSchema.properties.validation.type).toBe(
      'array',
    );
  });
});

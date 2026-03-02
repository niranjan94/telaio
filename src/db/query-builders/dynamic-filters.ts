import type {
  ExpressionBuilder,
  ExpressionWrapper,
  ReferenceExpression,
  SelectQueryBuilder,
  SqlBool,
} from 'kysely';
import { BadRequestError } from '../../errors/index.js';

/** Maximum nesting depth for filter expressions. */
const MAX_FILTER_DEPTH = 4;
/** Maximum total conditions across the entire filter. */
const MAX_FILTER_CONDITIONS = 20;

/** Mutable counter passed through recursive filter building. */
interface ConditionCounter {
  value: number;
}

/** Logical operators supported in the filter DSL. */
const LOGICAL_OPS = new Set(['$and', '$or', '$not']);

/** Comparison operators supported in the filter DSL. */
const COMPARISON_OPS = new Set([
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$contains',
  '$startswith',
  '$endswith',
  '$exists',
]);

/**
 * Escapes special SQL LIKE/ILIKE characters in a string.
 * Prevents user input from being interpreted as pattern matching wildcards.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Builds a Kysely expression for a single comparison operation.
 */
function buildComparison<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  column: ReferenceExpression<DB, TB>,
  op: string,
  value: unknown,
): ExpressionWrapper<DB, TB, SqlBool> {
  switch (op) {
    case '$eq':
      if (value === null) {
        return eb(column, 'is', null);
      }
      return eb(column, '=', value);
    case '$ne':
      if (value === null) {
        return eb(column, 'is not', null);
      }
      return eb(column, '!=', value);
    case '$gt':
      return eb(column, '>', value);
    case '$gte':
      return eb(column, '>=', value);
    case '$lt':
      return eb(column, '<', value);
    case '$lte':
      return eb(column, '<=', value);
    case '$in':
      if (!Array.isArray(value) || value.length === 0) {
        throw new BadRequestError('$in requires a non-empty array');
      }
      return eb(column, 'in', value);
    case '$nin':
      if (!Array.isArray(value) || value.length === 0) {
        throw new BadRequestError('$nin requires a non-empty array');
      }
      return eb(column, 'not in', value);
    case '$contains':
      return eb(column, 'ilike', `%${escapeLike(String(value))}%`);
    case '$startswith':
      return eb(column, 'ilike', `${escapeLike(String(value))}%`);
    case '$endswith':
      return eb(column, 'ilike', `%${escapeLike(String(value))}`);
    case '$exists':
      return value ? eb(column, 'is not', null) : eb(column, 'is', null);
    default:
      throw new BadRequestError(`Unknown filter operator: ${op}`);
  }
}

/**
 * Recursively builds a filter expression from the DSL object.
 * Supports logical operators ($and, $or, $not) and comparison operators.
 */
function buildFilterExpression<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  filter: unknown,
  filterableColumns: readonly ReferenceExpression<DB, TB>[],
  depth: number,
  counter: ConditionCounter,
): ExpressionWrapper<DB, TB, SqlBool> {
  if (depth > MAX_FILTER_DEPTH) {
    throw new BadRequestError(
      `Filter nesting exceeds maximum depth of ${MAX_FILTER_DEPTH}`,
    );
  }

  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    throw new BadRequestError('Filter must be a JSON object');
  }

  const entries = Object.entries(filter);
  if (entries.length === 0) {
    throw new BadRequestError('Filter object must not be empty');
  }

  const conditions: ExpressionWrapper<DB, TB, SqlBool>[] = [];

  for (const [key, value] of entries) {
    if (LOGICAL_OPS.has(key)) {
      if (key === '$not') {
        const inner = buildFilterExpression(
          eb,
          value,
          filterableColumns,
          depth + 1,
          counter,
        );
        conditions.push(eb.not(inner));
      } else if (key === '$and' || key === '$or') {
        if (!Array.isArray(value)) {
          throw new BadRequestError(`${key} requires an array`);
        }
        const subConditions = value.map((item) =>
          buildFilterExpression(
            eb,
            item,
            filterableColumns,
            depth + 1,
            counter,
          ),
        );
        if (subConditions.length === 0) {
          throw new BadRequestError(`${key} array must not be empty`);
        }
        if (key === '$and') {
          conditions.push(eb.and(subConditions));
        } else {
          conditions.push(eb.or(subConditions));
        }
      }
    } else {
      // Column-level filter
      const column = key as ReferenceExpression<DB, TB>;
      if (!filterableColumns.includes(column)) {
        throw new BadRequestError(`Filter column '${key}' is not allowed`);
      }

      counter.value++;
      if (counter.value > MAX_FILTER_CONDITIONS) {
        throw new BadRequestError(
          `Filter exceeds maximum of ${MAX_FILTER_CONDITIONS} conditions`,
        );
      }

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // Operator object: { "$gt": 5, "$lt": 10 }
        const opEntries = Object.entries(value);
        for (const [op, opValue] of opEntries) {
          if (!COMPARISON_OPS.has(op)) {
            throw new BadRequestError(`Unknown filter operator: ${op}`);
          }
          conditions.push(buildComparison(eb, column, op, opValue));
        }
      } else {
        // Direct value: shorthand for $eq
        conditions.push(buildComparison(eb, column, '$eq', value));
      }
    }
  }

  if (conditions.length === 1) {
    return conditions[0];
  }
  return eb.and(conditions);
}

/**
 * Applies a MongoDB-style filter DSL to a Kysely SELECT query.
 * Accepts either a JSON string or a parsed object.
 *
 * Filter DSL examples:
 * - `{ "status": "OPEN" }` — simple equality
 * - `{ "severity": { "$in": ["CRITICAL", "HIGH"] } }` — set membership
 * - `{ "createdAt": { "$gte": "2024-01-01" } }` — comparison
 * - `{ "$and": [{ "status": "OPEN" }, { "severity": "CRITICAL" }] }` — logical AND
 * - `{ "title": { "$contains": "vulnerability" } }` — case-insensitive substring
 * - `{ "$not": { "status": "RESOLVED" } }` — negation
 */
export function applyFilter<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  filterJson: string | Record<string, unknown>,
  filterableColumns: readonly ReferenceExpression<DB, TB>[],
): SelectQueryBuilder<DB, TB, O> {
  let parsed: unknown;
  try {
    parsed =
      typeof filterJson === 'string' ? JSON.parse(filterJson) : filterJson;
  } catch {
    throw new BadRequestError('Invalid filter JSON');
  }

  return query.where((eb) => {
    const counter: ConditionCounter = { value: 0 };
    return buildFilterExpression(eb, parsed, filterableColumns, 1, counter);
  });
}

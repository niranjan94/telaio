import type { SelectQueryBuilder } from 'kysely';
import { BadRequestError } from '../../errors/index.js';

/** Maximum number of results per page. */
const MAX_LIMIT = 100;
/** Default results per page. */
const DEFAULT_LIMIT = 20;
/** Default offset. */
const DEFAULT_SKIP = 0;
/** Maximum number of sort fields allowed. */
const MAX_SORT_FIELDS = 4;

/** Pagination metadata returned alongside query results. */
export interface PaginationMeta {
  total: number;
  skip: number;
  limit: number;
}

/** Options for sort-paginated queries. */
export interface SortPaginationOptions {
  /** Sort string: comma-separated field names, prefix `-` for descending. */
  sort?: string;
  /** Allowed sortable column names. */
  sortableColumns?: readonly string[];
  /** Number of results per page (clamped to 1..MAX_LIMIT). */
  limit?: number | string;
  /** Number of results to skip. */
  skip?: number | string;
}

/** Safely parse a value to an integer with a default fallback. */
function toInt(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : Math.floor(parsed);
}

/**
 * Applies sort parameters to a query, validating against allowed columns.
 * Sort syntax: comma-separated fields, `-` prefix for descending.
 * Example: `-createdAt,name` sorts by createdAt DESC then name ASC.
 */
function applySort<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  sortParam: string,
  sortableColumns?: readonly string[],
): SelectQueryBuilder<DB, TB, O> {
  const fields = sortParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (fields.length > MAX_SORT_FIELDS) {
    throw new BadRequestError(
      `Sort exceeds maximum of ${MAX_SORT_FIELDS} fields`,
    );
  }

  for (const field of fields) {
    const desc = field.startsWith('-');
    const col = desc ? field.slice(1) : field;

    if (sortableColumns && !sortableColumns.includes(col)) {
      throw new BadRequestError(`Sort field '${col}' is not allowed`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: Kysely orderBy accepts dynamic column names
    query = query.orderBy(col as any, desc ? 'desc' : 'asc');
  }

  return query;
}

/**
 * Executes a query with sort, pagination, and total count.
 * Runs the data query and count query concurrently for performance.
 * Returns both the data rows and pagination metadata.
 */
export async function sortPaginateQuery<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  options?: SortPaginationOptions,
): Promise<{ data: O[]; meta: PaginationMeta }> {
  // Apply sort
  if (options?.sort) {
    query = applySort(query, options.sort, options.sortableColumns);
  } else if (options?.sortableColumns?.includes('createdAt')) {
    // Default sort by createdAt descending if available
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column reference
    query = query.orderBy('createdAt' as any, 'desc');
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, toInt(options?.limit, DEFAULT_LIMIT)),
  );
  const skip = Math.max(0, toInt(options?.skip, DEFAULT_SKIP));

  // Run data query and count query concurrently
  const [data, countResult] = await Promise.all([
    query.offset(skip).limit(limit).execute(),
    query
      .clearSelect()
      .clearOrderBy()
      .clearLimit()
      .clearOffset()
      // biome-ignore lint/suspicious/noExplicitAny: Kysely expression builder
      .select((eb: any) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow(),
  ]);

  // biome-ignore lint/suspicious/noExplicitAny: count result shape varies
  const total = Number((countResult as any).count ?? 0);

  return { data, meta: { total, skip, limit } };
}

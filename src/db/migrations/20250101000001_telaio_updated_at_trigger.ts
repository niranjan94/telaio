import type { Migration } from 'kysely';
import { sql } from 'kysely';

/** Creates the updated_at trigger function migration. When a custom schema is provided, the function is schema-qualified. */
export function create(schema?: string): Migration {
  const qualifiedName =
    schema !== undefined && schema !== 'public'
      ? `"${schema}".trigger_set_updated_at_timestamp`
      : 'trigger_set_updated_at_timestamp';

  return {
    async up(db) {
      await sql
        .raw(
          `CREATE OR REPLACE FUNCTION ${qualifiedName}()
          RETURNS TRIGGER AS $$
          BEGIN
            NEW.updated_at = now();
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql`,
        )
        .execute(db);
    },
    async down(db) {
      await sql.raw(`DROP FUNCTION IF EXISTS ${qualifiedName}()`).execute(db);
    },
  };
}

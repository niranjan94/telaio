import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Creates the citext extension migration. Schema param is accepted for interface consistency but unused (extensions are database-level). */
export function create(_schema?: string): Migration {
  return {
    async up(db) {
      await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db);
    },
    async down(db) {
      await sql`DROP EXTENSION IF EXISTS citext`.execute(db);
    },
  };
}

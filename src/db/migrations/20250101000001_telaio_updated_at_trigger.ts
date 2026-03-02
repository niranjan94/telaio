import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
}

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS trigger_set_updated_at_timestamp()`.execute(
    db,
  );
}

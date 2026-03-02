import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db);
}

// biome-ignore lint/suspicious/noExplicitAny: migrations are schema-agnostic
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP EXTENSION IF EXISTS citext`.execute(db);
}

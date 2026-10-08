import { config as dotenvConfig } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

dotenvConfig({ path: [".env.local", ".env"], quiet: true });

let pool: Pool | null = null;

function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to touch a non-test database from tests: ${url || "(unset)"}`,
    );
  }
  return url;
}

export function getTestDb() {
  pool ??= new Pool({ connectionString: testUrl(), max: 5 });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

/** Truncate every public table except drizzle's migration bookkeeping. */
export async function truncateAll(): Promise<void> {
  const db = getTestDb();
  const res = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like '\\_\\_drizzle%'
  `);
  const names = res.rows.map((r) => `"${r.tablename}"`);
  if (names.length === 0) return;
  await db.execute(
    sql.raw(`truncate table ${names.join(", ")} restart identity cascade`),
  );
}

export async function closeTestDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

import { sql } from "drizzle-orm";
import type { SeedStep } from "./state";

/**
 * Truncate every table in `public` (business + Better Auth + global plans)
 * except drizzle's migration bookkeeping. pg-boss lives in its own schema and
 * is left alone. CASCADE so FK order does not matter.
 */
export const resetStep: SeedStep = {
  name: "reset",
  async run({ db }) {
    const res = await db.execute<{ tablename: string }>(sql`
      select tablename from pg_tables
      where schemaname = 'public' and tablename not like '\\_\\_drizzle%'
    `);
    const names = res.rows.map((r) => `"public"."${r.tablename}"`);
    if (names.length === 0) {
      throw new Error(
        "No tables found in schema public — run `pnpm db:migrate` before seeding.",
      );
    }
    await db.execute(
      sql.raw(`truncate table ${names.join(", ")} restart identity cascade`),
    );
    console.log(`[seed] truncated ${names.length} tables`);
  },
};

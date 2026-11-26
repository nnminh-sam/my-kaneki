import type { PGlite } from "@electric-sql/pglite";
import type { Db, Row } from "@/lib/db";

/** Env keys that select the auth mode and the feature switch. Tests save and restore them (one process runs all files). */
export const FEATURE_TEST_ENV_KEYS = ["JWT_SECRET", "VERCEL", "KANEKI_DISABLED_FEATURES"] as const;

export const TEST_JWT_SECRET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Captures the current values of the given env keys; call the returned function to restore them. */
export function captureEnv(keys: readonly string[]): () => void {
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return () => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

/** Local open mode (no JWT_SECRET, no VERCEL): the data owner is "". */
export function useOpenMode(): void {
  delete process.env.JWT_SECRET;
  delete process.env.VERCEL;
}

/** Locked mode (no JWT_SECRET on Vercel): the data owner is null for every request. */
export function useLockedMode(): void {
  delete process.env.JWT_SECRET;
  process.env.VERCEL = "1";
}

/** JWT mode: requests need a session token signed with TEST_JWT_SECRET. */
export function useJwtMode(): void {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  delete process.env.VERCEL;
}

/**
 * Runtime DB over one PGlite. `transaction` runs the statements inside a real PGlite transaction,
 * so a failing statement rolls the earlier ones back, as the production driver does.
 */
export function transactionalDb(pg: PGlite): Db {
  return {
    query: async (text, params) => (await pg.query(text, params as unknown[])).rows as Row[],
    transaction: (statements) =>
      pg.transaction(async (tx) => {
        const out: Row[][] = [];
        for (const statement of statements) {
          out.push((await tx.query(statement.text, statement.params as unknown[])).rows as Row[]);
        }
        return out;
      }),
  };
}

/** Counts rows of a table for a where clause, e.g. `count(pg, "feature_flags", "owner_id = $1", [""])`. */
export async function countRows(pg: PGlite, table: string, where = "true", params: unknown[] = []): Promise<number> {
  const { rows } = await pg.query<{ n: string }>(`select count(*)::text as n from ${table} where ${where}`, params);
  return Number(rows[0].n);
}

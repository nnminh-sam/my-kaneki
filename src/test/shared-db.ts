import { PGlite } from "@electric-sql/pglite";
import { setDbForTests, type Db, type Row } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { resetAiTableEnsuredForTests } from "@/lib/ai/providers";
import { resetVercelTableEnsuredForTests } from "@/lib/vercel";
import { setEmbedderForTests } from "@/lib/lms/embeddings";
import { setLlmJudgeForTests } from "@/lib/lms/grading";
import { resetVectorColumnCacheForTests } from "@/lib/lms/rag";

/**
 * One PGlite (in-WASM Postgres, ~550 MB RSS each) shared by every DB test in the process.
 * `npm test` runs all files in one process (`--experimental-test-isolation=none`), so the whole
 * suite pays for one instance and one migration run instead of one per file.
 */
interface Shared {
  pg: PGlite;
  /** Versions applied by the one real migration run. */
  applied: string[];
}

// Kept on globalThis so a second copy of this module (ESM/CJS dual load) still shares the instance.
const KEY = Symbol.for("my_kaneki.test.sharedPGlite");
type WithShared = typeof globalThis & { [KEY]?: Promise<Shared> };

function rowsOf(pg: PGlite) {
  return async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows as Row[];
}

async function create(): Promise<Shared> {
  const pg = new PGlite();
  const query = rowsOf(pg);
  const applied = await migrate({
    exec: async (sql) => {
      await pg.exec(sql);
    },
    query,
  });
  return { pg, applied };
}

function adapter(pg: PGlite): Db {
  const query = rowsOf(pg);
  return {
    query,
    transaction: async (statements) => {
      const out: Row[][] = [];
      for (const s of statements) out.push(await query(s.text, s.params));
      return out;
    },
  };
}

/** Empties every table except `schema_migrations`; the list is read each time because app code creates some tables lazily. */
async function truncateAll(pg: PGlite): Promise<void> {
  const { rows } = await pg.query<{ name: string }>(
    `select quote_ident(tablename) as name from pg_tables
      where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );
  if (rows.length) await pg.exec(`truncate ${rows.map((r) => r.name).join(", ")} restart identity cascade`);
}

/** Resets module-level test overrides and caches so one file's setup cannot leak into the next. */
export function resetTestHooks(): void {
  setEmbedderForTests(undefined);
  setLlmJudgeForTests(undefined);
  resetVectorColumnCacheForTests();
  resetAiTableEnsuredForTests();
  resetVercelTableEnsuredForTests();
}

/**
 * Gives the caller a clean, fully migrated database: the shared PGlite with every table emptied,
 * installed as the runtime DB via `setDbForTests`. Call it where a test used to create `new PGlite()`.
 */
export async function useTestDb(): Promise<Shared> {
  const g = globalThis as WithShared;
  g[KEY] ??= create();
  const shared = await g[KEY];
  await truncateAll(shared.pg);
  resetTestHooks();
  setDbForTests(adapter(shared.pg));
  return shared;
}

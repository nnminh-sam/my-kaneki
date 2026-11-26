// Verifies DATABASE_URL / DATABASE_URL_UNPOOLED reach the database (Neon, or the local docker-compose proxy).
// Run with `npm run db:smoke`. Goes through neonDb() so the local-proxy config and the driver share one module.
import { neonDb } from "../src/lib/db.ts";

async function check(name, url) {
  if (!url) throw new Error(`${name} is not set`);
  const [{ one }] = await neonDb(url).query("select 1 as one");
  if (one !== 1) throw new Error(`${name}: unexpected result ${one}`);
  console.log(`${name}: ok (branch ${process.env.NEON_BRANCH ?? "default"})`);
}

await check("DATABASE_URL", process.env.DATABASE_URL);
if (process.env.DATABASE_URL_UNPOOLED) {
  await check("DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED);
}

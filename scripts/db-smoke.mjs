// Verifies DATABASE_URL / DATABASE_URL_UNPOOLED reach Neon. Run with `npm run db:smoke`.
import { neon } from "@neondatabase/serverless";

async function check(name, url) {
  if (!url) throw new Error(`${name} is not set`);
  const sql = neon(url);
  const [{ one }] = await sql`select 1 as one`;
  if (one !== 1) throw new Error(`${name}: unexpected result ${one}`);
  console.log(`${name}: ok (branch ${process.env.NEON_BRANCH ?? "default"})`);
}

await check("DATABASE_URL", process.env.DATABASE_URL);
if (process.env.DATABASE_URL_UNPOOLED) {
  await check("DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED);
}

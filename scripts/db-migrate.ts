// Applies migrations/*.sql over the direct (or pooled) connection. Run with `npm run db:migrate`.
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";
import { migrate } from "../src/lib/migrate";

neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  const client = new Client(url);
  await client.connect();
  try {
    const applied = await migrate({
      exec: async (sql) => {
        await client.query(sql);
      },
      query: async (text, params) => (await client.query(text, params)).rows,
    });
    const branch = process.env.NEON_BRANCH ?? "default";
    console.log(applied.length ? `Applied on ${branch}: ${applied.join(", ")}` : `Up to date on ${branch}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

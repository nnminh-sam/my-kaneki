import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { captureEnv, FEATURE_TEST_ENV_KEYS, transactionalDb, useOpenMode } from "@/test/feature-test-env";
import { recordUsage } from "./usage";

const OWNER = "owner-usage-flags";

async function usageRows(pg: PGlite): Promise<number> {
  const { rows } = await pg.query<{ n: string }>(`select count(*)::text as n from lms_usage_log where owner_id = $1`, [OWNER]);
  return Number(rows[0].n);
}

describe("recordUsage is not gated by the lms flag", () => {
  let pg: PGlite;
  let restoreEnv: () => void;
  before(() => {
    restoreEnv = captureEnv(FEATURE_TEST_ENV_KEYS);
  });
  after(() => restoreEnv());

  beforeEach(async () => {
    ({ pg } = await useTestDb());
    setDbForTests(transactionalDb(pg));
    useOpenMode();
    delete process.env.KANEKI_DISABLED_FEATURES;
  });

  it("still writes the usage row when lms is off", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";

    await recordUsage({ ownerId: OWNER, operation: "agent_tool", tokens: 12, durationMs: 5 });

    assert.equal(await usageRows(pg), 1);
  });

  it("writes the usage row when lms is on", async () => {
    await recordUsage({ ownerId: OWNER, operation: "agent_tool", tokens: 12, durationMs: 5 });

    assert.equal(await usageRows(pg), 1);
  });
});

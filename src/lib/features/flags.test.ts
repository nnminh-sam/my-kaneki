import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { useTestDb } from "@/test/shared-db";
import type { Db } from "@/lib/db";
import { FEATURES } from "./registry";
import { disabledFeaturesFromEnv, getEffectiveFlags, isFeatureEnabled } from "./flags";

const savedEnv = process.env.KANEKI_DISABLED_FEATURES;

after(() => {
  if (savedEnv === undefined) delete process.env.KANEKI_DISABLED_FEATURES;
  else process.env.KANEKI_DISABLED_FEATURES = savedEnv;
});

describe("feature flags", () => {
  let pg: Awaited<ReturnType<typeof useTestDb>>["pg"];

  before(async () => {
    delete process.env.KANEKI_DISABLED_FEATURES;
    ({ pg } = await useTestDb());
  });

  function dbOver(): Db {
    return {
      query: async (text, params) => (await pg.query(text, params as unknown[])).rows as Record<string, unknown>[],
      transaction: async () => {
        throw new Error("not used by flag reads");
      },
    };
  }

  it("registers lms as released and on by default", () => {
    const lms = FEATURES.find((feature) => feature.id === "lms");
    assert.ok(lms);
    assert.equal(lms.stage, "released");
    assert.equal(lms.defaultEnabled, true);
  });

  it("uses the registry default when no row exists", async () => {
    assert.equal(await isFeatureEnabled("owner-default", "lms", { db: dbOver }), true);
  });

  it("follows the stored row for the owner", async () => {
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, $2, $3)", ["owner-row", "lms", false]);
    assert.equal(await isFeatureEnabled("owner-row", "lms", { db: dbOver }), false);
    await pg.query("update feature_flags set enabled = true where owner_id = $1 and feature = $2", ["owner-row", "lms"]);
    assert.equal(await isFeatureEnabled("owner-row", "lms", { db: dbOver }), true);
  });

  it("does not let one owner's row change another owner", async () => {
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, $2, $3)", ["owner-a", "lms", false]);
    assert.equal(await isFeatureEnabled("owner-b", "lms", { db: dbOver }), true);
  });

  it("rejects a duplicate owner and feature row", async () => {
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, $2, $3)", ["owner-dup", "lms", true]);
    await assert.rejects(
      pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, $2, $3)", ["owner-dup", "lms", false]),
    );
  });

  it("forces a feature off from the environment even when the row is on", async () => {
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, $2, $3)", ["owner-env", "lms", true]);
    process.env.KANEKI_DISABLED_FEATURES = "lms";
    try {
      const flags = await getEffectiveFlags("owner-env", { db: dbOver });
      assert.deepEqual(flags.lms, { enabled: false, forcedOff: true });
    } finally {
      delete process.env.KANEKI_DISABLED_FEATURES;
    }
  });

  it("parses the environment list tolerantly and ignores unknown ids", () => {
    const forced = disabledFeaturesFromEnv({ KANEKI_DISABLED_FEATURES: " LMS , nope,, " });
    assert.deepEqual([...forced], ["lms"]);
    assert.equal(disabledFeaturesFromEnv({}).size, 0);
  });

  it("returns registry defaults without throwing when the read fails", async () => {
    const failing: Db = {
      query: async () => {
        throw new Error("relation feature_flags does not exist");
      },
      transaction: async () => [],
    };
    const flags = await getEffectiveFlags("owner-fail", { db: () => failing });
    assert.deepEqual(flags.lms, { enabled: true, forcedOff: false });
  });
});

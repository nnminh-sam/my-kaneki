import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { countRows, captureEnv, FEATURE_TEST_ENV_KEYS, transactionalDb, useLockedMode, useOpenMode } from "@/test/feature-test-env";
import { setFeatureAction } from "./features";
import type { PGlite } from "@electric-sql/pglite";

describe("setFeatureAction", () => {
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

  it("stores the flag and writes one feature.toggle audit row in the same change", async () => {
    const result = await setFeatureAction("lms", false);

    assert.deepEqual(result, { ok: true });
    assert.equal(await countRows(pg, "feature_flags", "owner_id = $1 and feature = $2 and enabled = false", ["", "lms"]), 1);

    const audit = await pg.query<{ action: string; entity_type: string; entity_id: string; actor: string }>(
      `select action, entity_type, entity_id, actor from audit_log where action = 'feature.toggle'`,
    );
    assert.equal(audit.rows.length, 1);
    assert.deepEqual(audit.rows[0], {
      action: "feature.toggle",
      entity_type: "feature",
      entity_id: "lms",
      actor: "user",
    });
  });

  it("keeps one flag row and one audit row per change across off, on, off", async () => {
    assert.equal((await setFeatureAction("lms", false)).ok, true);
    assert.equal((await setFeatureAction("lms", true)).ok, true);
    assert.equal((await setFeatureAction("lms", false)).ok, true);

    assert.equal(await countRows(pg, "feature_flags", "owner_id = $1 and feature = $2", ["", "lms"]), 1);
    const { rows } = await pg.query<{ enabled: boolean }>(`select enabled from feature_flags where owner_id = '' and feature = 'lms'`);
    assert.equal(rows[0].enabled, false);
    assert.equal(await countRows(pg, "audit_log", "action = 'feature.toggle'"), 3);
  });

  it("refuses an unknown feature id with no write", async () => {
    const result = await setFeatureAction("not-a-feature", false);

    assert.equal(result.ok, false);
    assert.equal(result.error, "Unknown feature.");
    assert.equal(await countRows(pg, "feature_flags"), 0);
    assert.equal(await countRows(pg, "audit_log", "action = 'feature.toggle'"), 0);
  });

  it("refuses a feature forced off by the environment, whatever value is requested", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";

    for (const enabled of [true, false]) {
      const result = await setFeatureAction("lms", enabled);
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /server configuration/);
    }
    assert.equal(await countRows(pg, "feature_flags"), 0);
    assert.equal(await countRows(pg, "audit_log", "action = 'feature.toggle'"), 0);
  });

  it("refuses an unauthenticated caller before any write", async () => {
    useLockedMode();

    const result = await setFeatureAction("lms", false);

    assert.deepEqual(result, { ok: false, error: "Unauthorized" });
    assert.equal(await countRows(pg, "feature_flags"), 0);
    assert.equal(await countRows(pg, "audit_log", "action = 'feature.toggle'"), 0);
  });

  it("leaves no flag row when the audit insert in the same transaction fails", async () => {
    await pg.exec(`
      create or replace function test_refuse_feature_audit() returns trigger language plpgsql as $$
      begin raise exception 'audit write refused'; end $$;
      drop trigger if exists test_refuse_feature_audit on audit_log;
      create trigger test_refuse_feature_audit before insert on audit_log for each row
        when (new.action = 'feature.toggle') execute function test_refuse_feature_audit();
    `);
    try {
      const result = await setFeatureAction("lms", false);

      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Could not save the setting/);
      assert.equal(await countRows(pg, "feature_flags"), 0);
    } finally {
      await pg.exec(`
        drop trigger if exists test_refuse_feature_audit on audit_log;
        drop function if exists test_refuse_feature_audit();
      `);
    }
  });
});

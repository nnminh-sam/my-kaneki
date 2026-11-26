import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { PGlite } from "@electric-sql/pglite";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { createSubject } from "@/lib/lms/repo";
import { captureEnv, FEATURE_TEST_ENV_KEYS, transactionalDb, useOpenMode } from "@/test/feature-test-env";
import { GET as getSources } from "@/app/api/lms/sources/route";
import { setFeatureAction } from "./features";

async function subjectRows(pg: PGlite): Promise<unknown[]> {
  const { rows } = await pg.query(`select id, owner_id, slug, title, status, created_at from lms_subjects order by id`);
  return rows;
}

describe("lms flag round trip", () => {
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

  it("closes the LMS gates when toggled off and reopens them when toggled on, leaving LMS data unchanged", async () => {
    await createSubject("", { slug: "round-trip", title: "Round trip" });
    const seeded = await subjectRows(pg);
    assert.equal(seeded.length, 1);

    const sourcesUrl = "http://localhost:3000/api/lms/sources?subject=round-trip";

    assert.deepEqual(await setFeatureAction("lms", true), { ok: true });
    assert.equal((await getSources(new NextRequest(sourcesUrl))).status, 200);

    assert.deepEqual(await setFeatureAction("lms", false), { ok: true });
    const off = await getSources(new NextRequest(sourcesUrl));
    assert.equal(off.status, 403);
    assert.deepEqual(await off.json(), { error: "feature_disabled", feature: "lms" });
    assert.deepEqual(await subjectRows(pg), seeded);

    assert.deepEqual(await setFeatureAction("lms", true), { ok: true });
    assert.equal((await getSources(new NextRequest(sourcesUrl))).status, 200);
    assert.deepEqual(await subjectRows(pg), seeded);
  });
});

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { PGlite } from "@electric-sql/pglite";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { issueSession, SESSION_COOKIE } from "@/lib/auth";
import { FEATURES } from "@/lib/features";
import { captureEnv, FEATURE_TEST_ENV_KEYS, transactionalDb, useJwtMode } from "@/test/feature-test-env";
import { GET } from "./route";

const OWNER = "user-features-a";
const URL_FEATURES = "http://localhost:3000/api/features";

function token(): string {
  return issueSession({ id: OWNER, email: "features-a@example.com" }).token;
}

function bearerRequest(): NextRequest {
  return new NextRequest(URL_FEATURES, { headers: { authorization: `Bearer ${token()}` } });
}

function cookieRequest(): NextRequest {
  return new NextRequest(URL_FEATURES, { headers: { cookie: `${SESSION_COOKIE}=${token()}` } });
}

/** The entries the route must return for the given effective state of each registry feature. */
function expectedFeatures(state: Record<string, { enabled: boolean; forcedOff: boolean }>) {
  return FEATURES.map((feature) => ({
    id: feature.id,
    label: feature.label,
    description: feature.description,
    stage: feature.stage,
    enabled: state[feature.id].enabled,
    forcedOff: state[feature.id].forcedOff,
  }));
}

describe("GET /api/features", () => {
  let pg: PGlite;
  let restoreEnv: () => void;
  before(() => {
    restoreEnv = captureEnv(FEATURE_TEST_ENV_KEYS);
  });
  after(() => restoreEnv());

  beforeEach(async () => {
    ({ pg } = await useTestDb());
    setDbForTests(transactionalDb(pg));
    useJwtMode();
    delete process.env.KANEKI_DISABLED_FEATURES;
  });

  it("answers 401 for an unauthenticated caller", async () => {
    const res = await GET(new NextRequest(URL_FEATURES));

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  });

  it("returns every registry entry with its effective state for a bearer caller", async () => {
    const res = await GET(bearerRequest());

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      features: expectedFeatures(Object.fromEntries(FEATURES.map((f) => [f.id, { enabled: true, forcedOff: false }]))),
    });
  });

  it("returns the same entries for a session cookie caller", async () => {
    const res = await GET(cookieRequest());

    assert.equal(res.status, 200);
    const body = (await res.json()) as { features: { id: string; enabled: boolean }[] };
    assert.deepEqual(body.features.map((f) => f.id), FEATURES.map((f) => f.id));
  });

  it("reports the stored row for the caller, not for another owner", async () => {
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ($1, 'lms', false)", [OWNER]);
    await pg.query("insert into feature_flags (owner_id, feature, enabled) values ('user-other', 'lms', false)");

    const body = (await (await GET(bearerRequest())).json()) as { features: { id: string; enabled: boolean; forcedOff: boolean }[] };

    const lms = body.features.find((f) => f.id === "lms");
    assert.deepEqual(lms, { ...expectedFeatures({ lms: { enabled: false, forcedOff: false } })[0] });
  });

  it("reports forcedOff and enabled=false when the environment forces the feature off", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";

    const body = (await (await GET(bearerRequest())).json()) as { features: { id: string; enabled: boolean; forcedOff: boolean }[] };

    assert.deepEqual(
      body.features,
      expectedFeatures({ lms: { enabled: false, forcedOff: true } }),
    );
  });
});

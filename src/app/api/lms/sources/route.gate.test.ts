import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { PGlite } from "@electric-sql/pglite";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { issueSession } from "@/lib/auth";
import { createSource, createSubject } from "@/lib/lms/repo";
import type { SourceRow, SubjectRow } from "@/lib/lms/types";
import {
  captureEnv,
  FEATURE_TEST_ENV_KEYS,
  transactionalDb,
  useJwtMode,
} from "@/test/feature-test-env";
import { DELETE, GET, POST } from "./route";

const OWNER = "user-route-a";
const SOURCES_URL = "http://localhost:3000/api/lms/sources";

function sessionToken(): string {
  return issueSession({ id: OWNER, email: "route-a@example.com" }).token;
}

function authHeaders(authenticated: boolean): Headers {
  const headers = new Headers();
  if (authenticated) headers.set("authorization", `Bearer ${sessionToken()}`);
  return headers;
}

describe("/api/lms/sources behind the lms flag", () => {
  let pg: PGlite;
  let subject: SubjectRow;
  let source: SourceRow;
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

    subject = await createSubject(OWNER, { slug: "route-subject", title: "Route subject" });
    source = await createSource(OWNER, subject.id, { track: "byos", sourceType: "markdown", title: "Route source" });
  });

  describe("GET", () => {
    it("returns the sources when lms is on", async () => {
      const req = new NextRequest(`${SOURCES_URL}?subject=route-subject`, { headers: authHeaders(true) });
      const res = await GET(req);

      assert.equal(res.status, 200);
      const body = (await res.json()) as { sources: { id: string }[] };
      assert.deepEqual(body.sources.map((s) => s.id), [source.id]);
    });

    it("answers 403 feature_disabled for an authenticated caller when lms is off", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const req = new NextRequest(`${SOURCES_URL}?subject=route-subject`, { headers: authHeaders(true) });
      const res = await GET(req);

      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: "feature_disabled", feature: "lms" });
    });

    it("answers 401 before the feature check for an unauthenticated caller, even when lms is off", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const req = new NextRequest(`${SOURCES_URL}?subject=route-subject`, { headers: authHeaders(false) });
      const res = await GET(req);

      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "unauthorized" });
    });
  });

  describe("POST", () => {
    function uploadRequest(authenticated: boolean): NextRequest {
      const form = new FormData();
      form.set("subject", "route-subject");
      return new NextRequest(SOURCES_URL, { method: "POST", body: form, headers: authHeaders(authenticated) });
    }

    it("passes the gate when lms is on (missing file is then rejected by the route)", async () => {
      const res = await POST(uploadRequest(true));

      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "Missing 'file' in multipart form data." });
    });

    it("answers 403 feature_disabled when lms is off, before reading the upload", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const res = await POST(uploadRequest(true));

      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: "feature_disabled", feature: "lms" });
    });

    it("answers 401 before the feature check for an unauthenticated caller, even when lms is off", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const res = await POST(uploadRequest(false));

      assert.equal(res.status, 401);
    });
  });

  describe("DELETE", () => {
    function deleteRequest(id: string, authenticated: boolean): NextRequest {
      return new NextRequest(`${SOURCES_URL}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(authenticated),
      });
    }

    async function sourceRowCount(): Promise<number> {
      const { rows } = await pg.query(`select id from lms_sources where id = $1`, [source.id]);
      return rows.length;
    }

    it("deletes the source when lms is on", async () => {
      // The metadata update reads GitHub: stub fetch so the test makes no outbound call.
      const realFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response("{}", { status: 404 });
      try {
        const res = await DELETE(deleteRequest(source.id, true));

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { success: true, id: source.id });
      } finally {
        globalThis.fetch = realFetch;
      }
      assert.equal(await sourceRowCount(), 0);
    });

    it("answers 403 and deletes nothing when lms is off", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const res = await DELETE(deleteRequest(source.id, true));

      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: "feature_disabled", feature: "lms" });
      assert.equal(await sourceRowCount(), 1);
    });

    it("answers 401 and deletes nothing for an unauthenticated caller, even when lms is off", async () => {
      process.env.KANEKI_DISABLED_FEATURES = "lms";
      const res = await DELETE(deleteRequest(source.id, false));

      assert.equal(res.status, 401);
      assert.equal(await sourceRowCount(), 1);
    });
  });
});

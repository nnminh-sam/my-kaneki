import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { captureEnv, transactionalDb, useJwtMode } from "@/test/feature-test-env";
import { POST } from "./route";

const TEST_API_KEY = "test-secret-mcp-gate-key-1234567890123456";
const OWNER = "user-mcp-gate";
const FEATURE_OFF_MESSAGE = "Feature disabled: lms";
const ENV_KEYS = ["JWT_SECRET", "VERCEL", "KANEKI_MCP_API_KEY", "KANEKI_MCP_OWNER_ID", "KANEKI_DISABLED_FEATURES"];

function mcpRequest(authorization: string | null): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    host: "localhost:3000",
  });
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

/** Reads a JSON or single-event SSE response body, as the existing MCP route test does. */
async function readRpc(res: Response): Promise<{ result?: { tools?: { name: string }[] }; error?: { message: string } } | null> {
  const text = await res.text();
  const sse = text.match(/data:\s*(\{.*\})/);
  try {
    return JSON.parse(sse ? sse[1] : text);
  } catch {
    return null;
  }
}

describe("/api/mcp behind the lms flag", () => {
  // Shared process (--experimental-test-isolation=none): restore the env vars this suite sets, at the end of this suite.
  let restoreEnv: () => void;
  before(() => {
    restoreEnv = captureEnv(ENV_KEYS);
  });
  after(() => restoreEnv());

  beforeEach(async () => {
    const { pg } = await useTestDb();
    setDbForTests(transactionalDb(pg));
    // JWT mode, so a request without a bearer token is refused (open mode would admit it as owner "").
    useJwtMode();
    process.env.KANEKI_MCP_API_KEY = TEST_API_KEY;
    process.env.KANEKI_MCP_OWNER_ID = OWNER;
    delete process.env.KANEKI_DISABLED_FEATURES;
  });

  it("answers 401 for an unauthenticated caller, even when lms is off", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";

    const res = await POST(mcpRequest(null));

    assert.equal(res.status, 401);
    assert.ok(res.headers.get("www-authenticate"));
    const body = await readRpc(res);
    assert.equal(body?.error?.message, "Unauthorized: Invalid or missing Bearer token.");
  });

  it("lists the LMS tools for an authenticated caller when lms is on", async () => {
    const res = await POST(mcpRequest(`Bearer ${TEST_API_KEY}`));

    assert.equal(res.status, 200);
    const body = await readRpc(res);
    const names = body?.result?.tools?.map((tool) => tool.name) ?? [];
    assert.ok(names.some((name) => name.startsWith("lms")));
  });

  it("answers 403 with the feature message for an authenticated caller when lms is off", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";

    const res = await POST(mcpRequest(`Bearer ${TEST_API_KEY}`));

    assert.equal(res.status, 403);
    const body = await readRpc(res);
    assert.deepEqual(body, { jsonrpc: "2.0", error: { code: -32000, message: FEATURE_OFF_MESSAGE }, id: null });
  });
});

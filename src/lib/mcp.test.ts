import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPmAgentMcpTools } from "./mcp";

describe("my_pm MCP client helper", () => {
  it("gracefully returns empty tools when MY_PM_API_KEY is not set", async () => {
    const prevKey = process.env.MY_PM_API_KEY;
    delete process.env.MY_PM_API_KEY;

    try {
      const result = await getPmAgentMcpTools();
      assert.deepEqual(result.tools, {});
      assert.equal(typeof result.close, "function");
      // should resolve cleanly
      await result.close();
    } finally {
      if (prevKey !== undefined) {
        process.env.MY_PM_API_KEY = prevKey;
      }
    }
  });

  it("handles invalid or unreachable endpoint gracefully without throwing", async () => {
    const prevKey = process.env.MY_PM_API_KEY;
    const prevUrl = process.env.MY_PM_MCP_URL;
    process.env.MY_PM_API_KEY = "test-invalid-key";
    process.env.MY_PM_MCP_URL = "http://127.0.0.1:54321/invalid-mcp";

    try {
      const result = await getPmAgentMcpTools();
      assert.deepEqual(result.tools, {});
      assert.equal(typeof result.close, "function");
      await result.close();
    } finally {
      if (prevKey !== undefined) {
        process.env.MY_PM_API_KEY = prevKey;
      } else {
        delete process.env.MY_PM_API_KEY;
      }
      if (prevUrl !== undefined) {
        process.env.MY_PM_MCP_URL = prevUrl;
      } else {
        delete process.env.MY_PM_MCP_URL;
      }
    }
  });
});

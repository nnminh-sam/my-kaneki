import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentTools } from "./agent-tools";

describe("agent tools feature gate", () => {
  it("exposes LMS tools by default", () => {
    const keys = Object.keys(createAgentTools("owner-tools"));
    assert.ok(keys.some((key) => key.startsWith("lms")));
  });

  it("exposes no LMS tools when lms is off and keeps workspace tools", () => {
    const keys = Object.keys(createAgentTools("owner-tools", { lms: false }));
    assert.equal(keys.some((key) => key.startsWith("lms")), false);
    assert.ok(keys.includes("addTodo"));
    assert.ok(keys.includes("updateNote"));
  });
});

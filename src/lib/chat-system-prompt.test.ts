import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBaseSystem } from "./chat-system-prompt";

describe("buildBaseSystem", () => {
  it("omits all LMS wording when lms is off", () => {
    const prompt = buildBaseSystem({ lms: false });
    assert.equal(/lms/i.test(prompt), false);
    assert.equal(prompt.includes("Learning Management"), false);
    assert.ok(prompt.includes("addTodo and updateNote"));
    assert.ok(prompt.includes("success:false"));
  });

  it("includes the LMS sections when lms is on", () => {
    const prompt = buildBaseSystem({ lms: true });
    assert.ok(prompt.includes("Learning Management System (LMS)"));
    assert.ok(prompt.includes("lmsListSources"));
  });
});

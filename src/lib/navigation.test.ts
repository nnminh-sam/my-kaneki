import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hiddenNavItemIds, WORKSPACE_NAV_ITEMS } from "./navigation";

describe("hiddenNavItemIds", () => {
  it("hides the learning item only while lms is off", () => {
    assert.deepEqual(hiddenNavItemIds({ lms: false }), ["learning"]);
    assert.deepEqual(hiddenNavItemIds({ lms: true }), []);
  });

  it("never hides items without a feature", () => {
    const hidden = hiddenNavItemIds({ lms: false });
    assert.equal(hidden.includes("settings"), false);
    assert.equal(hidden.includes("ai-provider"), false);
    assert.ok(WORKSPACE_NAV_ITEMS.some((item) => item.id === "settings"));
  });
});

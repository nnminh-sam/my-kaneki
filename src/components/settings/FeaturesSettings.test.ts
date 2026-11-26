import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FeaturesSettings, type FeatureSettingsRow } from "./FeaturesSettings";

// Static markup only: visibility is not computed here, so "visible" means the badge element is rendered with text.
const ROW_CLASS = "flex items-start justify-between gap-4 rounded border border-border p-4";

const features: FeatureSettingsRow[] = [
  { id: "dev", label: "Dev feature", description: "In development.", stage: "dev", enabled: false, forcedOff: false },
  { id: "beta", label: "Beta feature", description: "In beta.", stage: "beta", enabled: true, forcedOff: false },
  { id: "released", label: "Released feature", description: "Released.", stage: "released", enabled: true, forcedOff: false },
];

/** useRouter only reads the context value; rendering does not call any router method. */
const routerStub = {} as unknown as AppRouterInstance;

function renderRows(): string {
  return renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: routerStub }, createElement(FeaturesSettings, { features })),
  );
}

describe("FeaturesSettings stage badges and toggles", () => {
  it("renders a non-empty, distinct stage badge for dev, beta and released rows", () => {
    const rows = renderRows().split(ROW_CLASS).slice(1);
    assert.equal(rows.length, 3);

    const badges = rows.map((row) => row.match(/<span[^>]*>([^<]*)<\/span>/)?.[1] ?? "");
    for (const badge of badges) assert.notEqual(badge.trim(), "");
    assert.equal(new Set(badges).size, 3);
  });

  it("renders the dev toggle off and enabled, and the beta and released toggles on and enabled", () => {
    const rows = renderRows().split(ROW_CLASS).slice(1);
    const toggles = rows.map((row) => row.match(/<input[^>]*>/)?.[0] ?? "");
    for (const toggle of toggles) assert.match(toggle, /type="checkbox"/, "every row must render a checkbox switch");

    assert.equal(/\schecked=""/.test(toggles[0]), false);
    assert.equal(/\sdisabled=""/.test(toggles[0]), false);
    assert.equal(/\schecked=""/.test(toggles[1]), true);
    assert.equal(/\sdisabled=""/.test(toggles[1]), false);
    assert.equal(/\schecked=""/.test(toggles[2]), true);
    assert.equal(/\sdisabled=""/.test(toggles[2]), false);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeLatexMath } from "./math";

describe("LaTeX Math Normalization", () => {
  it("leaves complex inline math expressions with \\text and \\rightarrow intact for KaTeX", () => {
    const raw = "• $\\text{Recursion} \\rightarrow \\text{Backtracking} \\rightarrow \\text{Memoization} \\rightarrow \\text{Tabulation (DP)}$.";
    const normalized = normalizeLatexMath(raw);
    assert.equal(normalized, raw);
  });

  it("converts bracket display math \\[ ... \\] to $$ ... $$", () => {
    const raw = "Formula: \\[ E = mc^2 \\]";
    const normalized = normalizeLatexMath(raw);
    assert.equal(normalized, "Formula: $$\nE = mc^2\n$$");
  });

  it("converts parenthesis inline math \\( ... \\) to $ ... $", () => {
    const raw = "Given \\( a^2 + b^2 = c^2 \\), find c.";
    const normalized = normalizeLatexMath(raw);
    assert.equal(normalized, "Given $a^2 + b^2 = c^2$, find c.");
  });

  it("replaces bare symbols outside math delimiters with unicode", () => {
    const raw = "Step 1 \\rightarrow Step 2 \\approx Step 3";
    const normalized = normalizeLatexMath(raw);
    assert.equal(normalized, "Step 1 → Step 2 ≈ Step 3");
  });

  it("does not mutate code blocks or inline code", () => {
    const raw = "Here is code:\n```\n\\(not math\\)\n\\rightarrow\n```\nand inline `\\rightarrow`";
    const normalized = normalizeLatexMath(raw);
    assert.equal(normalized, raw);
  });

  it("handles empty or falsy strings safely", () => {
    assert.equal(normalizeLatexMath(""), "");
  });
});

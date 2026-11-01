import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCitations } from "./citations";

describe("LMS Citation Sanity Checker", () => {
  it("passes validation for well-formed citations matching markdown references", () => {
    const md = `
Raft was introduced by Ongaro and Ousterhout [1].
In practice, etcd and CockroachDB implement variants [2].
`.trim();

    const citations = [
      "Ongaro, D. and Ousterhout, J. (2014) In Search of an Understandable Consensus Algorithm. https://raft.github.io/raft.pdf",
      "etcd Raft implementation https://github.com/etcd-io/raft",
    ];

    const res = validateCitations(md, citations);
    assert.equal(res.valid, true);
    assert.equal(res.defects.length, 0);
    assert.deepEqual(res.referencedIndices.sort(), [1, 2]);
  });

  it("detects missing citations array", () => {
    const res = validateCitations("Some claim.", []);
    assert.equal(res.valid, false);
    assert.ok(res.defects.some((d) => d.includes("No source citations provided")));
  });

  it("detects unresolvable [n] references in markdown", () => {
    const md = "Claim based on paper [3].";
    const citations = ["Citation 1 https://example.com/1"];

    const res = validateCitations(md, citations);
    assert.equal(res.valid, false);
    assert.ok(res.defects.some((d) => d.includes("Markdown references citation [3]")));
  });

  it("detects duplicate URLs in citation list", () => {
    const md = "Claims [1] and [2].";
    const citations = [
      "Source A https://example.com/same-paper",
      "Source B https://example.com/same-paper",
    ];

    const res = validateCitations(md, citations);
    assert.equal(res.valid, false);
    assert.ok(res.defects.some((d) => d.includes("Duplicate citation URL detected")));
  });
});

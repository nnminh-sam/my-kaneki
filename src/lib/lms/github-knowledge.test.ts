import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLmsPath } from "./github-knowledge";

describe("LMS GitHub Knowledge Path Sanitizer", () => {
  it("builds canonical lms/<slug>/ paths", () => {
    const p1 = sanitizeLmsPath("Raft-Consensus", "sources", "raft.pdf");
    assert.equal(p1, "lms/raft-consensus/sources/raft.pdf");

    const p2 = sanitizeLmsPath("distributed-kv", "nodes", "node-01.md");
    assert.equal(p2, "lms/distributed-kv/nodes/node-01.md");

    const p3 = sanitizeLmsPath("go-concurrency", "sources", "metadata.json");
    assert.equal(p3, "lms/go-concurrency/sources/metadata.json");
  });

  it("normalizes leading/trailing slashes and backslashes", () => {
    const p = sanitizeLmsPath("raft", "/sources/", "\\user\\notes.md");
    assert.equal(p, "lms/raft/sources/user/notes.md");
  });

  it("throws on path traversal attempt", () => {
    assert.throws(() => {
      sanitizeLmsPath("raft", "../secret.txt");
    }, /Directory traversal detected/);

    assert.throws(() => {
      sanitizeLmsPath("raft", "sources/../../etc/passwd");
    }, /Directory traversal detected/);
  });
});

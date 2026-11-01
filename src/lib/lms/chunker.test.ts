import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "./chunker";

describe("Markdown Semantic Chunker", () => {
  it("splits markdown by headings and builds hierarchical breadcrumbs", () => {
    const md = `
# Distributed Systems Overview
This is introductory text.

## Consensus Algorithms
Consensus is fundamental to fault-tolerant clusters.

### Raft Protocol
Raft decomposes consensus into leader election, log replication, and safety.
`.trim();

    const chunks = chunkMarkdown(md);
    assert.equal(chunks.length, 3);

    assert.equal(chunks[0].heading, "Distributed Systems Overview");
    assert.deepEqual(chunks[0].breadcrumb, ["Distributed Systems Overview"]);

    assert.equal(chunks[1].heading, "Consensus Algorithms");
    assert.deepEqual(chunks[1].breadcrumb, [
      "Distributed Systems Overview",
      "Consensus Algorithms",
    ]);

    assert.equal(chunks[2].heading, "Raft Protocol");
    assert.deepEqual(chunks[2].breadcrumb, [
      "Distributed Systems Overview",
      "Consensus Algorithms",
      "Raft Protocol",
    ]);
  });

  it("does not treat hash lines inside code fences as headings", () => {
    const md = `
# Python Example
Here is code:

\`\`\`python
# This is a comment inside code fence, not an H1!
def foo():
    return 42
\`\`\`

More explanation after code.
`.trim();

    const chunks = chunkMarkdown(md);
    // Should be a single chunk under "Python Example"
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, "Python Example");
    assert.equal(chunks[0].metadata.hasCode, true);
    assert.ok(chunks[0].content.includes("# This is a comment inside code fence"));
  });

  it("preserves markdown tables without splitting and sets hasTable metadata", () => {
    const md = `
# Benchmarks
Here are the throughput measurements:

| Algorithm | Throughput (ops/sec) | Latency (ms) |
| :--- | :--- | :--- |
| Paxos | 12,000 | 4.2 |
| Raft | 11,800 | 4.3 |
`.trim();

    const chunks = chunkMarkdown(md);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].metadata.hasTable, true);
    assert.ok(chunks[0].content.includes("| Raft | 11,800 | 4.3 |"));
  });

  it("splits long content when exceeding maxChunkChars at paragraph breaks", () => {
    const para1 = "Paragraph 1 ".repeat(100);
    const para2 = "Paragraph 2 ".repeat(100);
    const md = `# Big Chapter\n\n${para1}\n\n${para2}`;

    const chunks = chunkMarkdown(md, { maxChunkChars: 500 });
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0].heading, "Big Chapter");
    assert.equal(chunks[1].heading, "Big Chapter");
  });
});

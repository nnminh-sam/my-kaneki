import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { createSubject, createSource } from "./repo";
import { indexSource, searchRag, resetVectorColumnCacheForTests } from "./rag";
import { ingestUserFile } from "./ingest";
import { setEmbedderForTests, createDeterministicFakeEmbedder } from "./embeddings";

describe("LMS RAG Indexing & Ingestion Service (PGlite)", () => {
  it("indexes sources, performs hybrid search, and enforces cross-owner isolation", async () => {
    resetVectorColumnCacheForTests();
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push(
            (await pg.query(s.text, s.params)).rows as Record<string, unknown>[],
          );
        }
        return out;
      },
    });

    // Run migrations
    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    // Use deterministic fake embedder
    setEmbedderForTests(createDeterministicFakeEmbedder());

    const ownerAlice = "owner-alice";
    const ownerBob = "owner-bob";

    // Create subject for Alice
    const subjectAlice = await createSubject(ownerAlice, {
      slug: "raft-consensus",
      title: "Raft Distributed Consensus",
    });

    // Ingest Markdown text directly via ingestUserFile
    const mdContent = `
# Raft Overview
Raft is a consensus algorithm designed as an alternative to Multi-Paxos.
It decomposes state machine replication into leader election, log replication, and safety.

## Leader Election
Heartbeats are sent by the leader at regular intervals.
If followers do not receive heartbeats within a randomized election timeout, they transition to candidate.

## Log Invariants
Each log entry contains a term number and an index.
The AppendEntries RPC enforces the log matching property.
`.trim();

    const ingestRes = await ingestUserFile({
      ownerId: ownerAlice,
      subjectSlug: "raft-consensus",
      filename: "raft-guide.md",
      bytes: Buffer.from(mdContent, "utf-8"),
      perspective: "theory",
    });

    assert.equal(ingestRes.success, true);
    assert.equal(ingestRes.filename, "raft-guide.md");
    assert.ok(ingestRes.chunkCount >= 3, `Expected at least 3 chunks, got ${ingestRes.chunkCount}`);
    assert.ok(ingestRes.sourceId);

    // 1. Search RAG as Alice: query "leader election heartbeat"
    const resultsAlice = await searchRag({
      ownerId: ownerAlice,
      subjectSlug: "raft-consensus",
      query: "leader election heartbeat",
    });

    assert.ok(resultsAlice.length > 0);
    assert.ok(resultsAlice.some((r) => r.heading.includes("Leader Election") || r.content.includes("Heartbeat")));
    assert.equal(resultsAlice[0].track, "byos");
    assert.equal(resultsAlice[0].perspective, "theory");

    // 2. Filter search: filter by perspective="theory" (matches) vs perspective="critique" (empty)
    const theoryMatches = await searchRag({
      ownerId: ownerAlice,
      subjectSlug: "raft-consensus",
      query: "consensus",
      perspective: "theory",
    });
    assert.ok(theoryMatches.length > 0);

    const critiqueMatches = await searchRag({
      ownerId: ownerAlice,
      subjectSlug: "raft-consensus",
      query: "consensus",
      perspective: "critique",
    });
    assert.equal(critiqueMatches.length, 0);

    // 3. Cross-owner isolation: Bob searching for Alice's subject receives zero results
    const resultsBob = await searchRag({
      ownerId: ownerBob,
      subjectSlug: "raft-consensus",
      query: "leader election heartbeat",
    });
    assert.equal(resultsBob.length, 0);

    // 4. Ingest spreadsheet (CSV) with skipRag=true
    const csvContent = "Metric,Val\nThroughput,12000\nLatency,3.4ms";
    const csvRes = await ingestUserFile({
      ownerId: ownerAlice,
      subjectSlug: "raft-consensus",
      filename: "benchmarks.csv",
      bytes: Buffer.from(csvContent, "utf-8"),
      skipRag: true,
    });
    assert.equal(csvRes.success, true);
    assert.equal(csvRes.chunkCount, 0); // RAG indexing was skipped as requested
  });
});

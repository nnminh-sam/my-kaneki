import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDeterministicFakeEmbedder,
  EMBEDDING_DIMENSION,
  getEmbedder,
  setEmbedderForTests,
} from "./embeddings";

describe("LMS Embedding Provider", () => {
  it("generates deterministic normalized vectors of length 1536", async () => {
    const embedder = createDeterministicFakeEmbedder();
    assert.equal(embedder.dimension, EMBEDDING_DIMENSION);

    const [vec1] = await embedder.embed(["Hello Distributed Systems"]);
    assert.equal(vec1.length, 1536);

    // Verify determinism
    const [vec1Repeat] = await embedder.embed(["Hello Distributed Systems"]);
    assert.deepEqual(vec1, vec1Repeat);

    // Verify distinct text generates distinct vector
    const [vec2] = await embedder.embed(["Different subject completely"]);
    assert.notDeepEqual(vec1, vec2);

    // Verify unit norm (approximately 1.0)
    const norm = Math.sqrt(vec1.reduce((acc, v) => acc + v * v, 0));
    assert.ok(Math.abs(norm - 1.0) < 0.05, `Expected unit norm, got ${norm}`);
  });

  it("handles empty array cleanly", async () => {
    const embedder = createDeterministicFakeEmbedder();
    const res = await embedder.embed([]);
    assert.equal(res.length, 0);
  });

  it("respects setEmbedderForTests override", () => {
    const mock = createDeterministicFakeEmbedder(100);
    setEmbedderForTests(mock);
    assert.equal(getEmbedder().dimension, 100);
    setEmbedderForTests(undefined);
  });
});

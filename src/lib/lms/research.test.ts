import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { createSubject } from "./repo";
import {
  startResearchSession,
  submitResearchDraft,
  validateResearchDraft,
  resolveResearchEscalation,
  listEscalations,
} from "./research";
import { searchRag, resetVectorColumnCacheForTests } from "./rag";
import { setEmbedderForTests, createDeterministicFakeEmbedder } from "./embeddings";
import { InvalidTransitionError } from "./research-machine";

describe("LMS Research & Validation Persistence Service (PGlite)", () => {
  it("enforces 3-round peer review debate, escalates, and indexes into RAG upon user approval", async () => {
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

    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    setEmbedderForTests(createDeterministicFakeEmbedder());

    const owner = "owner-researcher";
    const subject = await createSubject(owner, {
      slug: "distributed-raft",
      title: "Raft Consensus",
    });

    const topicTitle = "Raft Linearizable Reads & ReadIndex";
    const citations = [
      "Ongaro Raft Thesis Section 6.4 https://raft.github.io/thesis.pdf [1]",
      "SOFAJRaft Linearizable Read Docs https://www.sofastack.tech/en/projects/sofa-jraft/linearizable-read/ [2]",
    ];

    // 1. Start research session
    const session = await startResearchSession(owner, "distributed-raft", topicTitle, [
      "theory",
      "practical",
      "critique",
    ]);

    assert.equal(session.validation_status, "pending");
    assert.equal(session.review_round, 0);
    assert.equal(session.track, "agent_research");

    // 2. Round 1: Research agent submits initial draft
    const draftR1 = `
# Linearizable Reads in Raft
Serving reads through the leader's state machine requires avoiding stale reads during network partitions [1].

## ReadIndex Mechanism
The leader confirms quorum heartbeat before responding [2].
`.trim();

    const r1Submitted = await submitResearchDraft(owner, session.id, {
      draftMarkdown: draftR1,
      citations,
    });
    assert.equal(r1Submitted.validation_status, "in_review");
    assert.equal(r1Submitted.debate_history.length, 1);
    assert.equal(r1Submitted.debate_history[0].actor, "research_agent");

    // 3. Round 1: Validation agent raises issues (clock drift)
    const r1Critique = await validateResearchDraft(owner, session.id, {
      decision: "raise_issues",
      critiqueSummary: "LeaseRead requires bounded clock drift; clarify safety guarantees.",
      defects: ["Explain LeaseRead vs ReadIndex tradeoffs."],
      citations,
    });
    assert.equal(r1Critique.validation_status, "pending");
    assert.equal(r1Critique.review_round, 1);

    // 4. Round 2: Research agent revises and defends findings
    const draftR2 = `
# Linearizable Reads in Raft
Serving reads requires quorum verification [1].

## ReadIndex vs LeaseRead
LeaseRead trades bounded clock drift for zero heartbeat overhead, whereas ReadIndex always heartbeats quorums [2].
`.trim();

    const r2Submitted = await submitResearchDraft(owner, session.id, {
      draftMarkdown: draftR2,
      citations,
      defenseArgument: "Section 6.4 of Ongaro thesis establishes bounded drift invariant.",
    });
    assert.equal(r2Submitted.validation_status, "in_review");

    // 5. Round 2: Validation agent still raises issues
    const r2Critique = await validateResearchDraft(owner, session.id, {
      decision: "raise_issues",
      critiqueSummary: "Still needs concrete etcd benchmarks.",
      defects: ["Include latency numbers."],
      citations,
    });
    assert.equal(r2Critique.review_round, 2);
    assert.equal(r2Critique.validation_status, "pending");

    // 6. Round 3: Research agent submits 3rd draft
    const draftR3 = draftR2 + "\n\n## Benchmarks\nReadIndex adds 0.5ms round-trip latency.";
    await submitResearchDraft(owner, session.id, {
      draftMarkdown: draftR3,
      citations,
      defenseArgument: "Latency numbers added from SOFAJRaft benchmarks.",
    });

    // 7. Round 3: Validation agent still rejects -> Escalates to user!
    const r3Critique = await validateResearchDraft(owner, session.id, {
      decision: "raise_issues",
      critiqueSummary: "Unresolved dispute over virtual machine pause vulnerability.",
      defects: ["VM pause can violate lease."],
      citations,
    });

    assert.equal(r3Critique.review_round, 3);
    assert.equal(r3Critique.validation_status, "escalated_to_user");

    // Verify listEscalations surfaces this topic to the user UI
    const escalations = await listEscalations(owner);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].id, session.id);

    // Verify Bob sees no escalations (owner isolation)
    assert.equal((await listEscalations("other-user")).length, 0);

    // Verify research agent cannot submit further drafts while escalated
    await assert.rejects(
      async () => {
        await submitResearchDraft(owner, session.id, {
          draftMarkdown: "Unauthorized 4th draft [1].",
          citations,
        });
      },
      (err) => err instanceof InvalidTransitionError,
    );

    // 8. Human user reviews debate and resolves escalation (Approve Override)
    const approved = await resolveResearchEscalation(owner, session.id, {
      userDecision: "approve_override",
      userNotes: "Learner accepts that ReadIndex is suitable and LeaseRead risk is acknowledged.",
    });

    assert.equal(approved.validation_status, "validated");

    // 9. Verify that approved research was indexed into RAG!
    const ragResults = await searchRag({
      ownerId: owner,
      subjectSlug: "distributed-raft",
      query: "ReadIndex quorum heartbeat",
    });

    assert.ok(ragResults.length > 0);
    assert.equal(ragResults[0].track, "agent_research");
    assert.ok(
      ragResults.some((r) => r.content.includes("ReadIndex") || r.heading.includes("Linearizable Reads")),
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { setEmbedderForTests } from "./embeddings";
import { setLlmJudgeForTests } from "./grading";
import { createLmsAgentTools } from "./lms-agent-tools";
import { getSubjectUsageReport } from "./usage";
import { getNodeById, getQuizById } from "./repo";
import { submitQuizAttempt } from "./quiz.service";

describe("LMS Phase 6: End-to-End Automated Learner Lifecycle", () => {
  it("completes full end-to-end agentic workflow across all tool groups", async () => {
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

    // Mock embedder: 1536-dim deterministic vectors
    setEmbedderForTests({
      dimension: 1536,
      async embed(texts) {
        return texts.map(() => new Array(1536).fill(0.01));
      },
    });

    // Mock LLM judge
    setLlmJudgeForTests({
      async evaluateAnswer({ userAnswer }) {
        return {
          score: userAnswer.length >= 10 ? 1.0 : 0.4,
          feedback: "Accurate response satisfying technical rubric criteria.",
        };
      },
    });

    const ownerId = "owner-e2e-student";
    const tools = createLmsAgentTools(ownerId);

    // 1. Group A: Profile setup
    const profileRes: any = await tools.lmsGetOrUpdateProfile.execute({
      learningStyle: {
        mode: "first_principles",
        pace: "standard",
        depth: "deep_mastery",
      },
      preferredLanguages: "TypeScript, Go",
    }, {} as any);
    assert.equal(profileRes.success, true);

    // 2. Group A: Subject creation
    const createSubRes: any = await tools.lmsCreateSubject.execute({
      title: "Consensus Protocols",
      slug: "consensus-protocols",
      difficultyScaleN: 4,
      capstoneProject: {
        title: "Distributed KV Store",
        description: "Replicated key-value engine with log compaction",
        milestones: [
          { title: "WAL Record Framing", targetNodeId: "node-1" },
          { title: "Leader Election Timers", targetNodeId: "node-2" },
        ],
      },
    }, {} as any);
    assert.equal(createSubRes.success, true);

    // 3. Group A: Subject overview check
    const overviewRes: any = await tools.lmsGetSubjectOverview.execute({
      subjectSlug: "consensus-protocols",
    }, {} as any);
    assert.equal(overviewRes.success, true);
    assert.equal(overviewRes.overview.progressPercentage, 0);

    // 4. Ingest knowledge source notes (grounding)
    const { ingestUserFile } = await import("./ingest");
    const ingestRes = await ingestUserFile({
      ownerId,
      subjectSlug: "consensus-protocols",
      filename: "consensus-notes.md",
      bytes: Buffer.from("# Consensus Notes\n\nState machine replication requires deterministic execution.\n\nWAL frames ensure safe crash recovery.", "utf-8"),
      perspective: "reference",
    });
    assert.equal(ingestRes.success, true);
    const sourceId = ingestRes.sourceId!;

    // 5. Seed placement question bank for tiers 1..4
    for (let t = 1; t <= 4; t++) {
      const qRes: any = await tools.lmsGenerateQuiz.execute({
        subjectSlug: "consensus-protocols",
        quizPurpose: "placement",
        quizType: "mcq_4",
        difficultyLevel: t,
        promptPayload: {
          type: "mcq_4",
          question: `Placement question for tier ${t}?`,
          options: [
            { label: "A", text: `Incorrect option for tier ${t}` },
            { label: "B", text: `Correct answer for tier ${t}` },
            { label: "C", text: `Distractor option ${t}` },
            { label: "D", text: `Another option ${t}` },
          ],
          correctOption: "B",
          explanation: `Explanation for tier ${t}`,
        },
      }, {} as any);
      assert.equal(qRes.success, true);
    }

    // 6. Group C: Diagnostic Placement
    const placementStartRes: any = await tools.lmsStartPlacement.execute({
      subjectSlug: "consensus-protocols",
    }, {} as any);
    assert.equal(placementStartRes.success, true);

    // 7. Group D: Learning Path Drafting
    const draftRes: any = await tools.lmsDraftLearningPath.execute({
      subjectSlug: "consensus-protocols",
      nodes: [
        {
          id: "node-1",
          title: "State Machine Replication Foundations",
          difficultyLevel: 1,
          ordinal: 1,
          summary: "Deterministic execution and Paxos vs Raft principles.",
          projectMilestone: "WAL Record Framing",
          githubMdPath: "lms/consensus-protocols/nodes/node-01.md",
          sourceIds: [sourceId],
        },
        {
          id: "node-2",
          title: "WAL Log Framing & AppendEntries",
          difficultyLevel: 2,
          ordinal: 2,
          summary: "CRC32 frame boundaries and disk flushing semantics.",
          projectMilestone: "Leader Election Timers",
          githubMdPath: "lms/consensus-protocols/nodes/node-02.md",
          sourceIds: [sourceId],
        },
        {
          id: "node-3",
          title: "Heartbeat Timers and Split Brain Safety",
          difficultyLevel: 3,
          ordinal: 3,
          summary: "Randomized timers and quorum-based leader validation.",
          githubMdPath: "lms/consensus-protocols/nodes/node-03.md",
          sourceIds: [sourceId],
        },
      ],
      edges: [
        { nodeId: "node-2", dependsOnNodeId: "node-1" },
        { nodeId: "node-3", dependsOnNodeId: "node-2" },
      ],
      attemptRound: 1,
    }, {} as any);
    assert.equal(draftRes.success, true);

    // Verify initial node status: entry level 1 -> node-1 unlocked
    const node1 = await getNodeById(ownerId, "node-1");
    assert.ok(node1);
    assert.equal(node1.status, "unlocked");

    const node2 = await getNodeById(ownerId, "node-2");
    assert.ok(node2);
    assert.equal(node2.status, "locked");

    // 8. Group D: Get Next Nodes with context
    const nextNodesRes: any = await tools.lmsGetNextNodes.execute({
      subjectSlug: "consensus-protocols",
      limit: 2,
    }, {} as any);
    assert.equal(nextNodesRes.success, true);
    assert.equal(nextNodesRes.nextNodes.length, 1);
    assert.equal(nextNodesRes.nextNodes[0].node.id, "node-1");

    // 9. Group D: Generate Mastery Gate Quiz for node-1
    const quizGenRes: any = await tools.lmsGenerateQuiz.execute({
      subjectSlug: "consensus-protocols",
      nodeId: "node-1",
      quizPurpose: "mastery_gate",
      quizType: "mcq_4",
      difficultyLevel: 1,
      promptPayload: {
        type: "mcq_4",
        question: "Why must replicas execute transactions deterministically?",
        options: [
          { label: "A", text: "To guarantee state equivalence across all replica logs." },
          { label: "B", text: "To speed up network round-trips." },
          { label: "C", text: "To avoid disk writes." },
          { label: "D", text: "It is not required." },
        ],
        correctOption: "A",
        explanation: "State machine replication requires all non-faulty nodes to reach identical states given the same inputs.",
      },
    }, {} as any);
    assert.equal(quizGenRes.success, true);
    const quizId = quizGenRes.quizId;

    // 10. Submit Quiz Attempt and Verify DAG Unlocking
    const submitRes = await submitQuizAttempt(ownerId, quizId, {
      type: "mcq_4",
      selectedOption: "A",
    });
    assert.equal(submitRes.passed, true);
    assert.equal(submitRes.score, 1.0);
    assert.deepEqual(submitRes.newlyUnlockedNodeIds, ["node-2"]);

    // Verify node-1 completed and node-2 unlocked!
    const node1After = await getNodeById(ownerId, "node-1");
    assert.equal(node1After?.status, "completed");

    const node2After = await getNodeById(ownerId, "node-2");
    assert.equal(node2After?.status, "unlocked");

    // 11. Check SRS Due Reviews
    const dueReviewsRes: any = await tools.lmsGetDueReviews.execute({
      subjectSlug: "consensus-protocols",
    }, {} as any);
    assert.equal(dueReviewsRes.success, true);

    // 10. Check Telemetry & Cost Reporting
    const usageReport = await getSubjectUsageReport(ownerId, node1.subject_id);
    assert.ok(usageReport);
    assert.equal(typeof usageReport.totalTokens, "number");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { setEmbedderForTests, createDeterministicFakeEmbedder } from "./embeddings";
import {
  createLearningSubject,
  transitionSubjectStatus,
  getSubjectOverview,
  LMSValidationError,
  PlacementBankIncompleteError,
} from "./subjects";
import {
  startPlacementSession,
  submitPlacementStep,
  retakePlacement,
} from "./placement.service";
import {
  draftLearningPath,
  getNextNodes,
  updateLearningNodeStatus,
} from "./path.service";
import {
  generateQuiz,
  getSafeQuiz,
  submitQuizAttempt,
} from "./quiz.service";
import {
  getDueReviews,
  submitReviewAttempt,
  getRetentionRate,
} from "./review.service";
import {
  createSource,
  createQuiz,
  listNodes,
  getNodeById,
  getSpacedRepetition,
} from "./repo";
import type { QuizPromptPayload } from "./types";

describe("LMS Phase 3: Path Engine, Placement, Mastery Gates, and SRS (PGlite)", () => {
  async function setupTestDb() {
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

    setEmbedderForTests(createDeterministicFakeEmbedder(1536));
    return pg;
  }

  it("completes full end-to-end adaptive learner lifecycle", async () => {
    await setupTestDb();
    const owner = "learner-alice";
    const intruder = "learner-intruder";

    // ========================================================================
    // 1. T3.1: Subjects Service & Overview
    // ========================================================================
    const subject = await createLearningSubject(owner, {
      title: "Distributed Systems & Raft",
      difficultyScaleN: 4, // 4 difficulty tiers for concise, complete test
    });
    assert.equal(subject.slug, "distributed-systems-raft");
    assert.equal(subject.difficulty_scale_n, 4);
    assert.equal(subject.status, "researching");

    // Slug collision handling: auto-generates suffix
    const duplicateSubject = await createLearningSubject(owner, {
      title: "Distributed Systems & Raft",
      difficultyScaleN: 4,
    });
    assert.equal(duplicateSubject.slug, "distributed-systems-raft-2");

    // Overview on empty state has zeroed metrics and null retention
    const initialOverview = await getSubjectOverview(owner, subject.slug);
    assert.equal(initialOverview.progressPercentage, 0);
    assert.equal(initialOverview.nodes.total, 0);
    assert.equal(initialOverview.srs.dueReviewsCount, 0);
    assert.equal(initialOverview.srs.retentionRate, null);

    // Guard: transition to placement fails without validated sources
    await assert.rejects(
      async () => {
        await transitionSubjectStatus(owner, subject.slug, "placement");
      },
      (err: Error) => err.message.includes("zero validated sources"),
    );

    // Add a validated knowledge source
    const source = await createSource(owner, subject.id, {
      track: "byos",
      sourceType: "markdown",
      title: "Raft Protocol Paper",
      originalUri: "https://raft.github.io/raft.pdf",
      githubMdPath: `lms/${subject.slug}/sources/raft-paper.md`,
      validationStatus: "validated",
    });
    assert.ok(source.id);

    // Guard: transition to placement fails if quiz bank is incomplete
    await assert.rejects(
      async () => {
        await transitionSubjectStatus(owner, subject.slug, "placement");
      },
      (err: Error) => err instanceof PlacementBankIncompleteError,
    );

    // Seed placement quiz bank covering all 4 tiers (MCQ questions)
    const tierQuizzes: Record<number, string> = {};
    for (let tier = 1; tier <= 4; tier++) {
      const q = await createQuiz(owner, subject.id, {
        quizPurpose: "placement",
        quizType: "mcq_4",
        difficultyLevel: tier,
        promptPayload: {
          type: "mcq_4",
          question: `Tier ${tier} question: What is concept ${tier}?`,
          options: [
            { label: "A", text: `Incorrect ${tier}` },
            { label: "B", text: `Correct answer for tier ${tier}` },
            { label: "C", text: `Distractor ${tier}` },
            { label: "D", text: `Another distractor ${tier}` },
          ],
          correctOption: "B",
          explanation: `Tier ${tier} explanation`,
        },
      });
      tierQuizzes[tier] = q.id;
    }

    // Now transition to placement succeeds
    const placementSubject = await transitionSubjectStatus(owner, subject.slug, "placement");
    assert.equal(placementSubject.status, "placement");

    // ========================================================================
    // 2. T3.2: Diagnostic Placement Binary Search
    // ========================================================================
    const startResult = await startPlacementSession(owner, subject.slug);
    assert.ok(startResult.session.id);
    assert.equal(startResult.session.low_bound, 1);
    assert.equal(startResult.session.high_bound, 4);
    assert.equal(startResult.session.current_mid, 2); // floor((1+4)/2) = 2

    // Crucial: Correct option must NOT leak to client/agent
    const strippedPayload = startResult.question.prompt_payload as any;
    assert.equal(strippedPayload.correctOption, undefined);
    assert.equal(strippedPayload.question, "Tier 2 question: What is concept 2?");

    // Cross-owner security check
    await assert.rejects(async () => {
      await submitPlacementStep(intruder, startResult.session.id, {
        quizId: tierQuizzes[2],
        submission: { type: "mcq_4", selectedOption: "B" },
      });
    });

    // Midpoint mismatch check: submitting tier 1 question when mid is 2 is rejected
    await assert.rejects(
      async () => {
        await submitPlacementStep(owner, startResult.session.id, {
          quizId: tierQuizzes[1],
          submission: { type: "mcq_4", selectedOption: "B" },
        });
      },
      (err: Error) => err.message.includes("does not match current session midpoint"),
    );

    // Step 1: Submit correct answer for midpoint tier 2
    const step1 = await submitPlacementStep(owner, startResult.session.id, {
      quizId: tierQuizzes[2],
      submission: { type: "mcq_4", selectedOption: "B" },
    });
    assert.equal(step1.done, false);
    assert.equal(step1.grading.passed, true);
    assert.equal(step1.session.low_bound, 3);
    assert.equal(step1.session.high_bound, 4);
    assert.equal(step1.session.current_mid, 3); // floor((3+4)/2) = 3
    assert.ok(step1.question);
    assert.equal((step1.question.prompt_payload as any).correctOption, undefined);

    // Idempotency check: Replay of Step 1 does not shift bounds twice
    const replayStep1 = await submitPlacementStep(owner, startResult.session.id, {
      quizId: tierQuizzes[2],
      submission: { type: "mcq_4", selectedOption: "B" },
    });
    assert.equal(replayStep1.done, false);
    assert.equal(replayStep1.session.low_bound, 3);
    assert.equal(replayStep1.session.high_bound, 4);
    assert.equal(replayStep1.grading.passed, true);

    // Step 2: Submit incorrect answer for tier 3 -> high becomes 3 - 1 = 2 < low (3) -> Done!
    const step2 = await submitPlacementStep(owner, startResult.session.id, {
      quizId: tierQuizzes[3],
      submission: { type: "mcq_4", selectedOption: "A" }, // incorrect
    });
    assert.equal(step2.done, true);
    assert.equal(step2.grading.passed, false);
    assert.equal(step2.resolvedLevel, 3); // Learner mastered up to tier 2; entry level is 3!
    assert.equal(step2.question, null);

    // Verify subject is now 'active' with entry_difficulty_level = 3
    const updatedSubject = await getSubjectOverview(owner, subject.slug);
    assert.equal(updatedSubject.subject.status, "active");
    assert.equal(updatedSubject.subject.entry_difficulty_level, 3);

    // ========================================================================
    // 3. T3.4: Learning Path Drafting & DAG Validation
    // ========================================================================
    // Invalid path (cycle): node-b depends on node-a, node-a depends on node-b
    const cycleDraft = await draftLearningPath(owner, subject.slug, {
      nodes: [
        { id: "node-1", title: "Intro", difficultyLevel: 1, sourceIds: [source.id] },
        { id: "node-2", title: "Basics", difficultyLevel: 2, sourceIds: [source.id] },
        { id: "node-3", title: "Consensus", difficultyLevel: 3, sourceIds: [source.id] },
      ],
      edges: [
        { nodeId: "node-2", dependsOnNodeId: "node-3" },
        { nodeId: "node-3", dependsOnNodeId: "node-2" },
      ],
    });
    assert.equal(cycleDraft.valid, false);
    assert.ok(cycleDraft.errors && cycleDraft.errors.some((e) => e.includes("Cycle detected")));

    // Invalid path (difficulty inversion: prereq tier 3 > dependent tier 1)
    const inversionDraft = await draftLearningPath(owner, subject.slug, {
      nodes: [
        { id: "node-1", title: "Intro", difficultyLevel: 1, sourceIds: [source.id] },
        { id: "node-3", title: "Hard Topic", difficultyLevel: 3, sourceIds: [source.id] },
      ],
      edges: [{ nodeId: "node-1", dependsOnNodeId: "node-3" }],
    });
    assert.equal(inversionDraft.valid, false);
    assert.ok(inversionDraft.errors && inversionDraft.errors.some((e) => e.includes("Difficulty inversion")));

    // Valid path DAG:
    // node-1 (tier 1) -> node-2 (tier 2) -> node-3 (tier 3) -> node-4 (tier 4)
    // Entry level is 3: node-1 and node-2 should be 'mastered_by_placement'
    // node-3 has all prereqs met -> should be 'unlocked'
    // node-4 depends on node-3 -> should be 'locked'
    const validDraft = await draftLearningPath(owner, subject.slug, {
      nodes: [
        {
          id: "node-1",
          title: "Network Foundations",
          difficultyLevel: 1,
          ordinal: 1,
          summary: "Basics of networking and IPC",
          sourceIds: [source.id],
          studyGuideMarkdown: "# Network Foundations\nContent here.",
        },
        {
          id: "node-2",
          title: "RPC and State Machines",
          difficultyLevel: 2,
          ordinal: 2,
          summary: "State machine replication principles",
          sourceIds: [source.id],
          studyGuideMarkdown: "# RPC and State Machines\nContent here.",
        },
        {
          id: "node-3",
          title: "Leader Election in Raft",
          difficultyLevel: 3,
          ordinal: 3,
          summary: "Heartbeats and randomized election timeouts",
          sourceIds: [source.id],
          projectMilestone: "Implement Raft election timer",
          studyGuideMarkdown: "# Leader Election in Raft\nContent here.",
        },
        {
          id: "node-4",
          title: "Log Replication & Safety",
          difficultyLevel: 4,
          ordinal: 4,
          summary: "Commit index and log matching property",
          sourceIds: [source.id],
          projectMilestone: "Complete Raft log replication engine",
          studyGuideMarkdown: "# Log Replication & Safety\nContent here.",
        },
      ],
      edges: [
        { nodeId: "node-2", dependsOnNodeId: "node-1" },
        { nodeId: "node-3", dependsOnNodeId: "node-2" },
        { nodeId: "node-4", dependsOnNodeId: "node-3" },
      ],
      capstoneProject: {
        title: "Distributed KV Store",
        description: "Build a fault-tolerant KV store backed by Raft",
        milestones: [
          { title: "Implement Raft election timer", completed: false, targetNodeId: "node-3" },
          { title: "Complete Raft log replication engine", completed: false, targetNodeId: "node-4" },
        ],
      },
    });

    assert.equal(validDraft.valid, true);
    assert.equal(validDraft.nodes?.length, 4);

    // Verify statuses
    const nodes = await listNodes(owner, subject.id);
    const node1 = nodes.find((n) => n.id === "node-1")!;
    const node2 = nodes.find((n) => n.id === "node-2")!;
    const node3 = nodes.find((n) => n.id === "node-3")!;
    const node4 = nodes.find((n) => n.id === "node-4")!;

    assert.equal(node1.status, "mastered_by_placement");
    assert.equal(node2.status, "mastered_by_placement");
    assert.equal(node3.status, "unlocked"); // Entry node at tier 3
    assert.equal(node4.status, "locked"); // Blocked on node 3

    // getNextNodes returns node-3
    const nextNodes = await getNextNodes(owner, subject.slug);
    assert.equal(nextNodes.length, 1);
    assert.equal(nextNodes[0].node.id, "node-3");

    // Overview updates dynamically
    const midOverview = await getSubjectOverview(owner, subject.slug);
    assert.equal(midOverview.nodes.total, 4);
    assert.equal(midOverview.nodes.masteredByPlacement, 2);
    assert.equal(midOverview.nodes.unlocked, 1);
    assert.equal(midOverview.nodes.locked, 1);
    assert.equal(midOverview.progressPercentage, 50); // 2 of 4 mastered = 50%
    assert.equal(midOverview.capstone.totalMilestones, 2);
    assert.equal(midOverview.capstone.completedMilestones, 0);

    // ========================================================================
    // 4. T3.5: Mastery Gate & Unlock
    // ========================================================================
    // Guard: Block creating gate quiz for a locked node (node-4)
    await assert.rejects(
      async () => {
        await generateQuiz(owner, subject.slug, {
          nodeId: "node-4",
          quizPurpose: "mastery_gate",
          quizType: "mcq_4",
          difficultyLevel: 4,
          promptPayload: {
            type: "mcq_4",
            question: "Is node 4 locked?",
            options: [
              { label: "A", text: "Yes" },
              { label: "B", text: "No" },
              { label: "C", text: "Maybe" },
              { label: "D", text: "Never" },
            ],
            correctOption: "A",
          },
        });
      },
      (err: Error) => err.message.includes("Cannot create mastery gate quiz for locked node"),
    );

    // Generate mastery gate quiz for unlocked node-3
    const gateQuiz3 = await generateQuiz(owner, subject.slug, {
      nodeId: "node-3",
      quizPurpose: "mastery_gate",
      quizType: "mcq_4",
      difficultyLevel: 3,
      promptPayload: {
        type: "mcq_4",
        question: "How does Raft resolve split votes?",
        options: [
          { label: "A", text: "Priority numbers" },
          { label: "B", text: "Randomized election timeouts" },
          { label: "C", text: "Global coordinator" },
          { label: "D", text: "Timestamp comparison" },
        ],
        correctOption: "B",
      },
    });

    // Check safe quiz strips correctOption before submission
    const safeGateQuiz = await getSafeQuiz(owner, gateQuiz3.id);
    assert.ok(safeGateQuiz);
    assert.equal((safeGateQuiz.prompt_payload as any).correctOption, undefined);

    // Submit failed attempt first
    const failAttempt = await submitQuizAttempt(owner, gateQuiz3.id, {
      type: "mcq_4",
      selectedOption: "A",
    });
    assert.equal(failAttempt.passed, false);
    const node3AfterFail = await getNodeById(owner, "node-3");
    assert.equal(node3AfterFail?.status, "in_progress");

    // Submit passed attempt
    const passAttempt = await submitQuizAttempt(owner, gateQuiz3.id, {
      type: "mcq_4",
      selectedOption: "B",
    });
    assert.equal(passAttempt.passed, true);
    assert.ok(passAttempt.newlyUnlockedNodeIds.includes("node-4"));

    // node-3 is now completed; node-4 was unlocked; SRS record created
    const node3AfterPass = await getNodeById(owner, "node-3");
    const node4AfterPass = await getNodeById(owner, "node-4");
    assert.equal(node3AfterPass?.status, "completed");
    assert.equal(node4AfterPass?.status, "unlocked");

    const srsNode3 = await getSpacedRepetition(owner, "node-3");
    assert.ok(srsNode3);
    assert.equal(srsNode3.reps, 1);
    assert.equal(srsNode3.interval_days, 1);

    // Check milestone 1 is now recognized as completed in overview
    const overviewAfterGate = await getSubjectOverview(owner, subject.slug);
    assert.equal(overviewAfterGate.progressPercentage, 75); // 3 of 4 = 75%
    assert.equal(overviewAfterGate.capstone.completedMilestones, 1); // node-3 milestone is done!

    // ========================================================================
    // 5. T3.6: Spaced Repetition Service (SM-2 Reviews)
    // ========================================================================
    // Due reviews lookup with future timestamp so node-3's review is due
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const dueReviews = await getDueReviews(owner, subject.slug, futureDate);
    assert.equal(dueReviews.length, 1);
    assert.equal(dueReviews[0].node?.id, "node-3");
    assert.equal(dueReviews[0].needsQuizGeneration, true); // No review variation created yet

    // Generate a fresh review quiz variation for node-3
    const reviewQuiz = await generateQuiz(owner, subject.slug, {
      nodeId: "node-3",
      quizPurpose: "spaced_repetition",
      quizType: "mcq_4",
      difficultyLevel: 3,
      promptPayload: {
        type: "mcq_4",
        question: "Review: What prevents split brain in Raft?",
        options: [
          { label: "A", text: "Majority quorums" },
          { label: "B", text: "Single server lock" },
          { label: "C", text: "Broadcast ping" },
          { label: "D", text: "Clock synchronization" },
        ],
        correctOption: "A",
      },
    });

    const dueReviewsWithQuiz = await getDueReviews(owner, subject.slug, futureDate);
    assert.equal(dueReviewsWithQuiz[0].needsQuizGeneration, false);
    assert.equal(dueReviewsWithQuiz[0].pendingQuiz?.id, reviewQuiz.id);

    // Pass review: rep becomes 2, interval becomes 3 days
    const reviewPass = await submitReviewAttempt(owner, reviewQuiz.id, {
      type: "mcq_4",
      selectedOption: "A",
    });
    assert.equal(reviewPass.passed, true);
    assert.equal(reviewPass.qualityGrade, 4);
    assert.equal(reviewPass.srsResult.reps, 2);
    assert.equal(reviewPass.srsResult.intervalDays, 3);
    assert.equal(reviewPass.srsResult.needsRefresher, false);

    // Retention rate is now 100% (1/1 review passed)
    const retention = await getRetentionRate(owner, subject.id);
    assert.equal(retention, 100);

    // ========================================================================
    // 6. Complete node-4 and Transition Subject to 'completed'
    // ========================================================================
    // Create gate quiz for node-4
    const gateQuiz4 = await generateQuiz(owner, subject.slug, {
      nodeId: "node-4",
      quizPurpose: "mastery_gate",
      quizType: "mcq_4",
      difficultyLevel: 4,
      promptPayload: {
        type: "mcq_4",
        question: "When is a Raft log entry committed?",
        options: [
          { label: "A", text: "When stored on a majority of nodes" },
          { label: "B", text: "Immediately on client receipt" },
          { label: "C", text: "Only on leader reboot" },
          { label: "D", text: "After 1 hour" },
        ],
        correctOption: "A",
      },
    });

    await submitQuizAttempt(owner, gateQuiz4.id, {
      type: "mcq_4",
      selectedOption: "A",
    });

    const finalOverview = await getSubjectOverview(owner, subject.slug);
    assert.equal(finalOverview.nodes.completed, 2); // node-3 and node-4
    assert.equal(finalOverview.nodes.masteredByPlacement, 2); // node-1 and node-2
    assert.equal(finalOverview.progressPercentage, 100);
    assert.equal(finalOverview.capstone.completedMilestones, 2);
    assert.equal(finalOverview.capstone.milestonesProgressPercentage, 100);

    // Transition subject to completed
    const completedSubject = await transitionSubjectStatus(owner, subject.slug, "completed");
    assert.equal(completedSubject.status, "completed");
  });

  it("updates learning node status and unlocks downstream dependent nodes", async () => {
    await setupTestDb();
    const owner = "test-node-status-owner";

    const subject = await createLearningSubject(owner, {
      title: "Algorithms in Depth",
      slug: "algorithms-in-depth",
      difficultyScaleN: 4,
    });

    const src = await createSource(owner, subject.id, {
      title: "Algorithms Syllabus",
      track: "byos",
      sourceType: "markdown",
      validationStatus: "validated",
    });

    await draftLearningPath(owner, subject.slug, {
      nodes: [
        {
          id: "algo-1",
          title: "Complexity Analysis & Architectural Trade-offs",
          difficultyLevel: 1,
          ordinal: 1,
          sourceIds: [src.id],
        },
        {
          id: "algo-2",
          title: "Linear Data Structures",
          difficultyLevel: 2,
          ordinal: 2,
          sourceIds: [src.id],
        },
      ],
      edges: [{ nodeId: "algo-2", dependsOnNodeId: "algo-1" }],
    });

    const node1Initial = await getNodeById(owner, "algo-1");
    assert.equal(node1Initial?.status, "unlocked");
    const node2Initial = await getNodeById(owner, "algo-2");
    assert.equal(node2Initial?.status, "locked");

    // Update by title match
    const result = await updateLearningNodeStatus(owner, {
      subjectSlug: subject.slug,
      nodeTitle: "Complexity Analysis",
      status: "completed",
    });

    assert.equal(result.node.id, "algo-1");
    assert.equal(result.node.status, "completed");
    assert.deepEqual(result.newlyUnlockedNodeIds, ["algo-2"]);

    const node2After = await getNodeById(owner, "algo-2");
    assert.equal(node2After?.status, "unlocked");

    // Verify SRS record was created
    const srs = await getSpacedRepetition(owner, "algo-1");
    assert.ok(srs);
    assert.equal(srs.node_id, "algo-1");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import {
  upsertProfile,
  getProfile,
  createSubject,
  getSubjectBySlug,
  getSubjectById,
  listSubjects,
  updateSubjectStatus,
  createSource,
  getSourceById,
  listSources,
  createNode,
  listNodes,
  setNodeEdges,
  listNodeEdges,
  createPlacementSession,
  getPlacementSession,
  updatePlacementStep,
  createQuiz,
  getQuizById,
  submitQuizResult,
  upsertSpacedRepetition,
  getSpacedRepetition,
  listDueReviews,
} from "./repo";

describe("LMS Repository Layer (PGlite)", () => {
  it("runs full lifecycle with cross-owner isolation", async () => {
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

    // Run all migrations
    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    const owner1 = "user-alice";
    const owner2 = "user-bob";

    // 1. Profile upsert
    const profile = await upsertProfile(owner1, {
      learningStyle: { mode: "code_first", pace: "intensive" },
      preferredLanguages: "TypeScript, Go",
    });
    assert.equal(profile.owner_id, owner1);
    assert.equal(profile.learning_style.mode, "code_first");

    const fetchedProfile = await getProfile(owner1);
    assert.equal(fetchedProfile?.preferred_languages, "TypeScript, Go");
    assert.equal(await getProfile(owner2), null);

    // 2. Subject creation
    const subj1 = await createSubject(owner1, {
      slug: "raft-go",
      title: "Raft Consensus in Go",
      difficultyScaleN: 16,
      capstoneProject: {
        title: "Distributed KV Store",
        description: "Build Raft from scratch",
        milestones: [
          { title: "Milestone 1: WAL", completed: false },
        ],
      },
    });
    assert.equal(subj1.owner_id, owner1);
    assert.equal(subj1.slug, "raft-go");
    assert.equal(subj1.status, "researching");

    // Cross-owner: Bob cannot see Alice's subject
    assert.equal(await getSubjectBySlug(owner2, "raft-go"), null);
    assert.equal(await getSubjectById(owner2, subj1.id), null);
    assert.equal((await listSubjects(owner2)).length, 0);

    // Alice sees her subject
    const aliceSubjects = await listSubjects(owner1);
    assert.equal(aliceSubjects.length, 1);
    assert.equal(aliceSubjects[0].id, subj1.id);

    // Update status
    const updatedSubj = await updateSubjectStatus(owner1, subj1.id, "placement");
    assert.equal(updatedSubj?.status, "placement");

    // 3. Source creation
    const source1 = await createSource(owner1, subj1.id, {
      track: "byos",
      sourceType: "markdown",
      title: "Raft Paper Notes",
      originalUri: "notes/raft.md",
      githubMdPath: "lms/raft-go/sources/user/raft.md",
      perspective: "theory",
      validationStatus: "validated",
    });
    assert.equal(source1.title, "Raft Paper Notes");

    // Bob cannot fetch Alice's source
    assert.equal(await getSourceById(owner2, source1.id), null);
    const aliceSources = await listSources(owner1, subj1.id);
    assert.equal(aliceSources.length, 1);

    // 4. Nodes and Edges
    const node1 = await createNode(owner1, subj1.id, {
      title: "01. Concurrency Basics",
      difficultyLevel: 1,
      status: "unlocked",
    });
    const node2 = await createNode(owner1, subj1.id, {
      title: "02. WAL Framing",
      difficultyLevel: 2,
      projectMilestone: "Milestone 1: WAL",
      status: "locked",
    });

    const aliceNodes = await listNodes(owner1, subj1.id);
    assert.equal(aliceNodes.length, 2);

    // Set dependency edge: node2 depends on node1
    await setNodeEdges(owner1, subj1.id, [
      { nodeId: node2.id, dependsOnNodeId: node1.id },
    ]);
    const edges = await listNodeEdges(owner1, subj1.id);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].node_id, node2.id);
    assert.equal(edges[0].depends_on_node_id, node1.id);

    // 5. Placement Session
    const placement = await createPlacementSession(owner1, subj1.id, {
      lowBound: 1,
      highBound: 16,
      currentMid: 8,
    });
    assert.equal(placement.current_mid, 8);
    assert.equal(placement.status, "in_progress");

    const updatedPl = await updatePlacementStep(owner1, placement.id, {
      lowBound: 9,
      highBound: 16,
      currentMid: 12,
      status: "in_progress",
      history: [
        {
          stepIndex: 1,
          difficultyTested: 8,
          passed: true,
          lowBefore: 1,
          highBefore: 16,
          lowAfter: 9,
          highAfter: 16,
        },
      ],
    });
    assert.equal(updatedPl?.current_mid, 12);
    assert.equal(updatedPl?.history.length, 1);

    // 6. Quizzes
    const quiz1 = await createQuiz(owner1, subj1.id, {
      nodeId: node1.id,
      quizPurpose: "mastery_gate",
      quizType: "mcq_4",
      difficultyLevel: 1,
      promptPayload: {
        type: "mcq_4",
        question: "What is Raft leader election timeout?",
        options: [
          { label: "A", text: "Fixed 100ms" },
          { label: "B", text: "Randomized between 150-300ms" },
          { label: "C", text: "Always 10 seconds" },
          { label: "D", text: "No timeout" },
        ],
        correctOption: "B",
      },
    });

    assert.equal(quiz1.passed, null);
    const submitted = await submitQuizResult(owner1, quiz1.id, {
      userSubmission: { type: "mcq_4", selectedOption: "B" },
      passed: true,
      score: 1.0,
      agentFeedback: "Correct! Randomized timeouts prevent split votes.",
    });
    assert.equal(submitted?.passed, true);
    assert.equal(submitted?.score, 1.0);

    // 7. Spaced Repetition
    const dueTime = new Date(Date.now() - 1000).toISOString();
    const futureTime = new Date(Date.now() + 86400000).toISOString();

    const srs1 = await upsertSpacedRepetition(owner1, subj1.id, node1.id, {
      reps: 1,
      lapses: 0,
      intervalDays: 1,
      nextReviewAt: dueTime,
    });
    assert.equal(srs1.reps, 1);

    const dueList = await listDueReviews(owner1);
    assert.equal(dueList.length, 1);
    assert.equal(dueList[0].node_id, node1.id);

    // Bob has no due reviews
    const bobDue = await listDueReviews(owner2);
    assert.equal(bobDue.length, 0);

    // Update with future time
    await upsertSpacedRepetition(owner1, subj1.id, node1.id, {
      reps: 2,
      lapses: 0,
      intervalDays: 3,
      nextReviewAt: futureTime,
    });
    const dueListAfter = await listDueReviews(owner1);
    assert.equal(dueListAfter.length, 0);
  });
});

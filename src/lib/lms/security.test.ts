import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import {
  createSubject,
  getSubjectBySlug,
  listSubjects,
  createNode,
  listNodes,
  createQuiz,
  getQuizById,
  createSource,
  getSourceById,
  listSources,
} from "./repo";
import { getSafeQuiz, submitQuizAttempt } from "./quiz.service";
import { searchRag } from "./rag";
import { getDueReviews } from "./review.service";
import { resolveResearchEscalation } from "./research";
import { checkRateLimit, assertRateLimit, recordUsage } from "./usage";
import { parseSpreadsheet } from "./parsers/xlsx";

describe("LMS Phase 6: Security & Cross-Owner Isolation Matrix", () => {
  it("enforces strict cross-owner isolation across all repositories and services", async () => {
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

    const alice = "owner-alice-sec";
    const bob = "owner-bob-sec";

    // Alice creates a subject
    const subjectAlice = await createSubject(alice, {
      title: "Alice Private Systems",
      slug: "alice-private-systems",
      difficultyScaleN: 8,
    });

    // 1. Subject isolation: Bob cannot retrieve or list Alice's subject
    const bobSubjectLookup = await getSubjectBySlug(bob, subjectAlice.slug);
    assert.equal(bobSubjectLookup, null);

    const bobSubjectsList = await listSubjects(bob);
    assert.equal(bobSubjectsList.length, 0);

    // 2. Node isolation: Alice creates a node
    const nodeAlice = await createNode(alice, subjectAlice.id, {
      id: "node-sec-1",
      title: "Confidential Node",
      difficultyLevel: 1,
      ordinal: 1,
      status: "unlocked",
      githubMdPath: "lms/alice-private-systems/nodes/node-01.md",
    });

    const bobNodes = await listNodes(bob, subjectAlice.id);
    assert.equal(bobNodes.length, 0);

    // 3. Quiz isolation & answer safety
    const quizAlice = await createQuiz(alice, subjectAlice.id, {
      nodeId: nodeAlice.id,
      quizPurpose: "mastery_gate",
      quizType: "mcq_4",
      difficultyLevel: 1,
      promptPayload: {
        type: "mcq_4",
        question: "Secret question?",
        options: [
          { label: "A", text: "Answer A" },
          { label: "B", text: "Answer B" },
          { label: "C", text: "Answer C" },
          { label: "D", text: "Answer D" },
        ],
        correctOption: "A",
      },
    });

    const bobQuizLookup = await getQuizById(bob, quizAlice.id);
    assert.equal(bobQuizLookup, null);

    const bobSafeQuiz = await getSafeQuiz(bob, quizAlice.id);
    assert.equal(bobSafeQuiz, null);

    // Alice fetches safe quiz: correctOption must be stripped
    const aliceSafe = await getSafeQuiz(alice, quizAlice.id);
    assert.ok(aliceSafe);
    assert.equal((aliceSafe.prompt_payload as { correctOption?: string }).correctOption, undefined);

    // 4. Bob cannot submit quiz attempts for Alice's quiz
    await assert.rejects(
      async () => {
        await submitQuizAttempt(bob, quizAlice.id, {
          type: "mcq_4",
          selectedOption: "A",
        });
      },
      /Quiz ".*" not found/,
    );

    // 5. Source & Escalation isolation
    const sourceAlice = await createSource(alice, subjectAlice.id, {
      id: "src-sec-1",
      track: "agent_research",
      sourceType: "markdown",
      title: "Alice Research",
      originalUri: "https://example.com/alice",
      validationStatus: "escalated_to_user",
      reviewRound: 3,
      debateHistory: [
        {
          round: 3,
          actor: "validation_agent",
          action: "raise_issues",
          summary: "Disputed claims",
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const bobSource = await getSourceById(bob, sourceAlice.id);
    assert.equal(bobSource, null);

    const bobSources = await listSources(bob, subjectAlice.id);
    assert.equal(bobSources.length, 0);

    // Bob cannot resolve Alice's escalation
    await assert.rejects(
      async () => {
        await resolveResearchEscalation(bob, sourceAlice.id, {
          userDecision: "approve_override",
          userNotes: "Hacker note",
        });
      },
      /not found for owner/,
    );

    // 6. RAG cross-owner isolation
    const ragMatches = await searchRag({
      ownerId: bob,
      subjectSlug: subjectAlice.slug,
      query: "confidential",
    });
    assert.equal(ragMatches.length, 0);

    // 7. Spaced repetition review isolation
    await assert.rejects(
      async () => {
        await getDueReviews(bob, subjectAlice.slug);
      },
      /not found for owner/,
    );
    const bobReviews = await getDueReviews(bob);
    assert.equal(bobReviews.length, 0);
  });

  it("enforces rate-limiting and cost control per owner", async () => {
    const owner = "owner-rate-test";

    // Verify rate limit check allows initial requests
    const status = await checkRateLimit(owner, "llm_judge");
    assert.equal(status.allowed, true);

    // Record usage
    await recordUsage({
      ownerId: owner,
      operation: "llm_judge",
      model: "gpt-oss:120b",
      tokens: 150,
      durationMs: 400,
    });

    const statusAfter = await checkRateLimit(owner, "llm_judge");
    assert.equal(statusAfter.currentDailyCount, 1);
  });

  it("guards against zip-bomb and oversized table payloads in upload parsers", () => {
    // Generate a CSV buffer with 600 rows (exceeding MAX_ROWS_PER_SHEET of 500)
    const header = "Col1,Col2,Col3\n";
    const rows = Array.from({ length: 600 }, (_, i) => `Val_${i},Data_${i},Num_${i}`).join("\n");
    const buffer = Buffer.from(header + rows, "utf-8");

    const result = parseSpreadsheet(buffer, true);
    assert.ok(result.warnings.length > 0);
    assert.match(result.warnings[0], /truncated from 601 rows to 500 rows/);

    // Verify output markdown table is capped
    const outputLines = result.text.split("\n");
    // 500 rows + header + separator = ~502 lines
    assert.ok(outputLines.length <= 505);
  });
});

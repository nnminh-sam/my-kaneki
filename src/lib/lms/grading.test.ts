import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gradeQuiz, stripAnswerKey, type LlmJudge } from "./grading";
import type { QuizRow } from "./types";

describe("LMS Polymorphic Quiz Grading Engine", () => {
  it("strips correctOption from mcq_4 prompts so answer keys never leak to clients", () => {
    const rawMcq: QuizRow["prompt_payload"] = {
      type: "mcq_4",
      question: "What is Raft election timeout?",
      options: [
        { label: "A", text: "Fixed 50ms" },
        { label: "B", text: "Randomized 150-300ms" },
        { label: "C", text: "10s" },
        { label: "D", text: "None" },
      ],
      correctOption: "B",
      explanation: "Randomized timeout prevents split votes.",
    };

    const safe = stripAnswerKey(rawMcq) as { correctOption?: string };
    assert.equal(safe.correctOption, undefined);
  });

  it("grades mcq_4 accurately and deterministically", async () => {
    const quiz: QuizRow = {
      id: "quiz-1",
      subject_id: "subj-1",
      node_id: "node-1",
      placement_session_id: null,
      quiz_purpose: "mastery_gate",
      quiz_type: "mcq_4",
      difficulty_level: 2,
      prompt_payload: {
        type: "mcq_4",
        question: "Sample question?",
        options: [
          { label: "A", text: "Alpha" },
          { label: "B", text: "Beta" },
          { label: "C", text: "Gamma" },
          { label: "D", text: "Delta" },
        ],
        correctOption: "C",
        explanation: "Gamma is correct.",
      },
      user_submission: null,
      passed: null,
      score: null,
      agent_feedback: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    // Correct submission
    const resPass = await gradeQuiz(quiz, { type: "mcq_4", selectedOption: "C" });
    assert.equal(resPass.passed, true);
    assert.equal(resPass.score, 1.0);
    assert.ok(resPass.feedback.includes("Gamma is correct."));

    // Incorrect submission
    const resFail = await gradeQuiz(quiz, { type: "mcq_4", selectedOption: "A" });
    assert.equal(resFail.passed, false);
    assert.equal(resFail.score, 0.0);
    assert.ok(resFail.feedback.includes("The correct option was (C)"));
  });

  it("grades open_ended questions using LLM judge with pass threshold 0.7", async () => {
    const customJudge: LlmJudge = {
      async evaluateAnswer({ userAnswer }) {
        if (userAnswer.includes("quorum")) {
          return { score: 0.9, feedback: "Excellent explanation of quorum safety." };
        }
        return { score: 0.4, feedback: "Missed essential quorum consensus requirements." };
      },
    };

    const quiz: QuizRow = {
      id: "quiz-open",
      subject_id: "subj-1",
      node_id: "node-1",
      placement_session_id: null,
      quiz_purpose: "mastery_gate",
      quiz_type: "open_ended",
      difficulty_level: 3,
      prompt_payload: {
        type: "open_ended",
        prompt: "Why does Raft require majority quorum?",
        rubricCriteria: ["Majority overlap guarantees at least one up-to-date node"],
      },
      user_submission: null,
      passed: null,
      score: null,
      agent_feedback: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    const passRes = await gradeQuiz(
      quiz,
      { type: "open_ended", response: "Because any two quorums must overlap on at least one node." },
      customJudge,
    );
    assert.equal(passRes.passed, true);
    assert.equal(passRes.score, 0.9);

    const failRes = await gradeQuiz(
      quiz,
      { type: "open_ended", response: "It makes things faster." },
      customJudge,
    );
    assert.equal(failRes.passed, false);
    assert.equal(failRes.score, 0.4);
  });

  it("grades project_task verifying all checklist items are completed", async () => {
    const quiz: QuizRow = {
      id: "quiz-project",
      subject_id: "subj-1",
      node_id: "node-1",
      placement_session_id: null,
      quiz_purpose: "mastery_gate",
      quiz_type: "project_task",
      difficulty_level: 3,
      prompt_payload: {
        type: "project_task",
        milestoneTitle: "Milestone 1: WAL framing",
        specification: "Build binary log records with CRC32",
        checklist: [
          "CRC32 framing encoded in log record header",
          "Torn write truncated upon reboot recovery",
        ],
      },
      user_submission: null,
      passed: null,
      score: null,
      agent_feedback: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    // Incomplete submission (only index 0 checked)
    const incomplete = await gradeQuiz(quiz, {
      type: "project_task",
      completedChecklistIndices: [0],
    });
    assert.equal(incomplete.passed, false);
    assert.equal(incomplete.score, 0.5);

    // Complete submission (indices 0 and 1 checked)
    const complete = await gradeQuiz(quiz, {
      type: "project_task",
      completedChecklistIndices: [0, 1],
    });
    assert.equal(complete.passed, true);
    assert.equal(complete.score, 1.0);
  });

  it("rejects submission with mismatched modality type", async () => {
    const quiz: QuizRow = {
      id: "quiz-mcq",
      subject_id: "subj-1",
      node_id: "node-1",
      placement_session_id: null,
      quiz_purpose: "mastery_gate",
      quiz_type: "mcq_4",
      difficulty_level: 1,
      prompt_payload: {
        type: "mcq_4",
        question: "Q?",
        options: [
          { label: "A", text: "1" },
          { label: "B", text: "2" },
          { label: "C", text: "3" },
          { label: "D", text: "4" },
        ],
        correctOption: "A",
      },
      user_submission: null,
      passed: null,
      score: null,
      agent_feedback: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    await assert.rejects(async () => {
      await gradeQuiz(quiz, { type: "open_ended", response: "Answer text" });
    }, /does not match quiz type/);
  });
});

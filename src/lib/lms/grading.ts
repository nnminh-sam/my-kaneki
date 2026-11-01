import type {
  QuizRow,
  QuizPromptPayload,
  QuizSubmission,
  McqPromptPayload,
} from "./types";

export interface GradingResult {
  passed: boolean;
  score: number;
  feedback: string;
}

export interface LlmJudge {
  evaluateAnswer(params: {
    question: string;
    rubricCriteria: string[];
    userAnswer: string;
    expectedHighlights?: string;
  }): Promise<{ score: number; feedback: string }>;
}

/**
 * Creates a deterministic mock LLM judge for automated testing and offline usage.
 */
export function createMockLlmJudge(): LlmJudge {
  return {
    async evaluateAnswer({ userAnswer, rubricCriteria }) {
      if (!userAnswer || userAnswer.trim().length === 0) {
        return { score: 0.0, feedback: "No answer provided." };
      }
      // Simple rubric check: returns high score if answer has substantial length
      if (userAnswer.length >= 20) {
        return {
          score: 1.0,
          feedback: `Good response meeting rubric criteria: ${rubricCriteria.join(", ")}`,
        };
      }
      return {
        score: 0.5,
        feedback: "Answer is too brief to satisfy all rubric criteria.",
      };
    },
  };
}

let activeLlmJudge: LlmJudge | undefined;

export function setLlmJudgeForTests(judge: LlmJudge | undefined) {
  activeLlmJudge = judge;
}

export function getLlmJudge(): LlmJudge {
  if (!activeLlmJudge) {
    activeLlmJudge = createMockLlmJudge();
  }
  return activeLlmJudge;
}

/**
 * Strips the answer key (correctOption) from the quiz prompt payload
 * so it never leaves the server or reaches the learner client before submission.
 */
export function stripAnswerKey(payload: QuizPromptPayload): QuizPromptPayload {
  if (payload.type === "mcq_4") {
    const { correctOption: _omitted, ...safePayload } = payload as McqPromptPayload & {
      correctOption?: string;
    };
    return safePayload as QuizPromptPayload;
  }
  return payload;
}

/**
 * Evaluates and grades a quiz submission polymorphically across all 4 modalities:
 * - mcq_4: Deterministic exact match.
 * - open_ended: Rubric evaluation via LLM-as-a-judge.
 * - code_challenge: Static/rubric evaluation.
 * - project_task: Checklist completion verification.
 */
export async function gradeQuiz(
  quiz: QuizRow,
  submission: QuizSubmission,
  customJudge?: LlmJudge,
): Promise<GradingResult> {
  const payload = quiz.prompt_payload;
  const judge = customJudge || getLlmJudge();

  if (payload.type !== submission.type) {
    throw new Error(
      `Submission type "${submission.type}" does not match quiz type "${payload.type}".`,
    );
  }

  // 1. MCQ (mcq_4)
  if (payload.type === "mcq_4" && submission.type === "mcq_4") {
    const isCorrect = submission.selectedOption === payload.correctOption;
    return {
      passed: isCorrect,
      score: isCorrect ? 1.0 : 0.0,
      feedback: isCorrect
        ? payload.explanation || "Correct answer!"
        : `Incorrect. The correct option was (${payload.correctOption}). ${payload.explanation || ""}`.trim(),
    };
  }

  // 2. Open-Ended Concept Question (open_ended)
  if (payload.type === "open_ended" && submission.type === "open_ended") {
    const evalRes = await judge.evaluateAnswer({
      question: payload.prompt,
      rubricCriteria: payload.rubricCriteria,
      userAnswer: submission.response,
      expectedHighlights: payload.idealAnswerHighlights,
    });
    const PASS_THRESHOLD = 0.7;
    return {
      passed: evalRes.score >= PASS_THRESHOLD,
      score: evalRes.score,
      feedback: evalRes.feedback,
    };
  }

  // 3. Code Challenge (code_challenge)
  if (payload.type === "code_challenge" && submission.type === "code_challenge") {
    const evalRes = await judge.evaluateAnswer({
      question: payload.instruction,
      rubricCriteria: payload.rubricCriteria || ["Code must be syntactically valid and solve constraints."],
      userAnswer: submission.code,
    });
    const PASS_THRESHOLD = 0.7;
    return {
      passed: evalRes.score >= PASS_THRESHOLD,
      score: evalRes.score,
      feedback: evalRes.feedback,
    };
  }

  // 4. Project Task Milestone (project_task)
  if (payload.type === "project_task" && submission.type === "project_task") {
    const totalItems = payload.checklist.length;
    if (totalItems === 0) {
      return { passed: true, score: 1.0, feedback: "Project milestone self-attested." };
    }

    const uniqueCompleted = new Set(
      submission.completedChecklistIndices.filter((idx) => idx >= 0 && idx < totalItems),
    );
    const score = Number((uniqueCompleted.size / totalItems).toFixed(2));
    const passed = uniqueCompleted.size === totalItems;

    return {
      passed,
      score,
      feedback: passed
        ? "All milestone criteria verified!"
        : `Completed ${uniqueCompleted.size} of ${totalItems} checklist requirements.`,
    };
  }

  throw new Error(`Unhandled quiz modality: ${(payload as { type: string }).type}`);
}

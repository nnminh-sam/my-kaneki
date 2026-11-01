import { z } from "zod";
import type {
  QuizRow,
  QuizPurpose,
  QuizModality,
  QuizPromptPayload,
  QuizSubmission,
  SpacedRepetitionRow,
} from "./types";
import { quizPromptPayloadSchema } from "./types";
import {
  getSubjectBySlug,
  getQuizById,
  createQuiz,
  submitQuizResult,
  getNodeById,
  updateNodeStatus,
  listNodes,
  listNodeEdges,
  updateNodesStatus,
  upsertSpacedRepetition,
} from "./repo";
import { gradeQuiz, stripAnswerKey, type GradingResult, type LlmJudge } from "./grading";
import { unlockedNodes } from "./dag";
import { searchRag, type RagSearchResult } from "./rag";
import { LMSValidationError } from "./subjects";

export interface GenerateQuizParams {
  nodeId?: string | null;
  placementSessionId?: string | null;
  quizPurpose: QuizPurpose;
  quizType: QuizModality;
  difficultyLevel: number;
  promptPayload: QuizPromptPayload;
}

export interface QuizSubmissionResult {
  passed: boolean;
  score: number;
  feedback: string;
  quiz: QuizRow;
  newlyUnlockedNodeIds: string[];
  srsRecord?: SpacedRepetitionRow | null;
  targetedExcerpts?: RagSearchResult[];
}

/**
 * Validates and registers a quiz (placement, mastery gate, or spaced repetition).
 * Blocks mastery gate quizzes if node is locked or study material is not published.
 */
export async function generateQuiz(
  ownerId: string,
  subjectSlug: string,
  params: GenerateQuizParams,
): Promise<QuizRow> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  // 1. Zod payload validation
  quizPromptPayloadSchema.parse(params.promptPayload);

  // 2. Mastery gate preconditions
  if (params.quizPurpose === "mastery_gate") {
    if (!params.nodeId) {
      throw new LMSValidationError("Mastery gate quiz requires a valid nodeId.");
    }

    const node = await getNodeById(ownerId, params.nodeId);
    if (!node || node.subject_id !== subject.id) {
      throw new LMSValidationError(`Node "${params.nodeId}" not found for this subject.`);
    }

    if (node.status === "locked") {
      throw new LMSValidationError(
        `Cannot create mastery gate quiz for locked node "${node.id}". Complete prerequisites first.`,
      );
    }

    if (!node.github_md_path || !node.github_md_path.trim()) {
      throw new LMSValidationError(
        `Cannot create mastery gate quiz before node material is published (missing github_md_path).`,
      );
    }
  }

  return await createQuiz(ownerId, subject.id, {
    nodeId: params.nodeId,
    placementSessionId: params.placementSessionId,
    quizPurpose: params.quizPurpose,
    quizType: params.quizType,
    difficultyLevel: params.difficultyLevel,
    promptPayload: params.promptPayload,
  });
}

/**
 * Retrieves a quiz with the answer key stripped so learners/agents cannot cheat before submission.
 */
export async function getSafeQuiz(ownerId: string, quizId: string): Promise<QuizRow | null> {
  const quiz = await getQuizById(ownerId, quizId);
  if (!quiz) return null;

  // Only strip answer key if the quiz has not yet been completed
  if (!quiz.completed_at) {
    return {
      ...quiz,
      prompt_payload: stripAnswerKey(quiz.prompt_payload),
    };
  }

  return quiz;
}

/**
 * Evaluates a mastery gate or node quiz attempt.
 * If passed:
 * - Marks the node as completed
 * - Evaluates prerequisites to unlock newly unblocked downstream nodes
 * - Seeds the spaced repetition schedule (review due in 1 day)
 * If failed:
 * - Updates node status to 'in_progress'
 * - Retrieves targeted RAG excerpts based on user gaps
 */
export async function submitQuizAttempt(
  ownerId: string,
  quizId: string,
  submission: QuizSubmission,
  customJudge?: LlmJudge,
): Promise<QuizSubmissionResult> {
  const quiz = await getQuizById(ownerId, quizId);
  if (!quiz) {
    throw new LMSValidationError(`Quiz "${quizId}" not found.`);
  }

  let node = quiz.node_id ? await getNodeById(ownerId, quiz.node_id) : null;

  if (quiz.quiz_purpose === "mastery_gate") {
    if (!node) {
      throw new LMSValidationError(`Node linked to mastery gate quiz was not found.`);
    }
    if (node.status === "locked") {
      throw new LMSValidationError(`Cannot attempt mastery gate for locked node "${node.id}".`);
    }
    if (!node.github_md_path || !node.github_md_path.trim()) {
      throw new LMSValidationError(`Cannot attempt mastery gate before node material is published.`);
    }
  }

  // 1. Grade polymorphic submission
  const grading = await gradeQuiz(quiz, submission, customJudge);

  // 2. Persist quiz submission result
  const updatedQuiz = await submitQuizResult(ownerId, quiz.id, {
    userSubmission: submission,
    passed: grading.passed,
    score: grading.score,
    agentFeedback: grading.feedback,
  });

  const newlyUnlockedNodeIds: string[] = [];
  let srsRecord: SpacedRepetitionRow | null = null;
  let targetedExcerpts: RagSearchResult[] = [];

  if (quiz.quiz_purpose === "mastery_gate" && node) {
    if (grading.passed) {
      // Mark node completed
      await updateNodeStatus(ownerId, node.id, "completed");

      // Check for unlockable downstream nodes
      const allNodes = await listNodes(ownerId, quiz.subject_id);
      const allEdges = await listNodeEdges(ownerId, quiz.subject_id);

      const unlockableIds = unlockedNodes(
        allNodes.map((n) => ({
          id: n.id,
          status: n.id === node.id ? "completed" : n.status,
        })),
        allEdges.map((e) => ({
          nodeId: e.node_id,
          dependsOnNodeId: e.depends_on_node_id,
        })),
      );

      const toUnlock = allNodes.filter(
        (n) => unlockableIds.includes(n.id) && n.status === "locked",
      );

      if (toUnlock.length > 0) {
        const unlockIds = toUnlock.map((n) => n.id);
        await updateNodesStatus(ownerId, quiz.subject_id, unlockIds, "unlocked");
        newlyUnlockedNodeIds.push(...unlockIds);
      }

      // Schedule initial Spaced Repetition review (+1 day)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      srsRecord = await upsertSpacedRepetition(ownerId, quiz.subject_id, node.id, {
        stability: 2.5,
        difficulty: 2.5,
        reps: 1,
        lapses: 0,
        intervalDays: 1,
        lastReviewedAt: new Date().toISOString(),
        nextReviewAt: tomorrow,
      });
    } else {
      // Failed mastery gate: transition node to in_progress if currently unlocked
      if (node.status === "unlocked") {
        await updateNodeStatus(ownerId, node.id, "in_progress");
      }

      // Fetch targeted RAG study material to guide remediation
      try {
        targetedExcerpts = await searchRag({
          ownerId,
          subjectSlug: "", // Will match by subject_id directly in rag search if needed or node title
          query: `${node.title} ${grading.feedback}`,
          difficultyLevel: node.difficulty_level,
          limit: 3,
        });
      } catch {
        targetedExcerpts = [];
      }
    }
  }

  return {
    passed: grading.passed,
    score: grading.score,
    feedback: grading.feedback,
    quiz: updatedQuiz!,
    newlyUnlockedNodeIds,
    srsRecord,
    targetedExcerpts: targetedExcerpts.length > 0 ? targetedExcerpts : undefined,
  };
}

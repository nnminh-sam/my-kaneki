import type {
  SpacedRepetitionRow,
  NodeRow,
  QuizRow,
  QuizSubmission,
} from "./types";
import {
  listDueReviews,
  getSpacedRepetition,
  upsertSpacedRepetition,
  getQuizById,
  submitQuizResult,
  getNodeById,
  getPendingQuizForNode,
  getSubjectBySlug,
  getSubjectReviewStats,
} from "./repo";
import { scheduleReview, type SrsScheduledResult } from "./srs";
import { gradeQuiz, type LlmJudge } from "./grading";
import { searchRag, type RagSearchResult } from "./rag";
import { LMSValidationError } from "./subjects";

export interface DueReviewItem {
  srs: SpacedRepetitionRow;
  node: NodeRow | null;
  pendingQuiz: QuizRow | null;
  needsQuizGeneration: boolean;
}

export interface ReviewSubmissionResult {
  passed: boolean;
  qualityGrade: 0 | 1 | 2 | 3 | 4 | 5;
  gradingScore: number;
  feedback: string;
  srsResult: SrsScheduledResult;
  refresherExcerpts?: RagSearchResult[];
}

/**
 * Maps quiz grading outcome to SM-2 quality grade q in 0..5.
 * MCQ: Correct -> 4, Incorrect -> 1
 * Open/Code/Project: Proportional to normalized score
 */
export function mapScoreToQualityGrade(
  quizType: string,
  passed: boolean,
  score: number,
): 0 | 1 | 2 | 3 | 4 | 5 {
  if (quizType === "mcq_4") {
    return passed ? 4 : 1;
  }

  if (score >= 0.9) return 5;
  if (score >= 0.75) return 4;
  if (score >= 0.6) return 3;
  if (score >= 0.4) return 2;
  if (score >= 0.2) return 1;
  return 0;
}

/**
 * Retrieves all items currently due for spaced repetition review.
 * Flags nodes that lack an uncompleted spaced repetition quiz so the agent can generate fresh variations.
 */
export async function getDueReviews(
  ownerId: string,
  subjectSlug?: string,
  nowTimestamp: string = new Date().toISOString(),
): Promise<DueReviewItem[]> {
  const allDue = await listDueReviews(ownerId, nowTimestamp);

  let targetSubjectId: string | undefined;
  if (subjectSlug) {
    const subject = await getSubjectBySlug(ownerId, subjectSlug);
    if (!subject) {
      throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
    }
    targetSubjectId = subject.id;
  }

  const filtered = targetSubjectId
    ? allDue.filter((s) => s.subject_id === targetSubjectId)
    : allDue;

  const items: DueReviewItem[] = [];
  for (const srs of filtered) {
    const node = await getNodeById(ownerId, srs.node_id);
    const pendingQuiz = await getPendingQuizForNode(ownerId, srs.node_id, "spaced_repetition");

    items.push({
      srs,
      node,
      pendingQuiz,
      needsQuizGeneration: pendingQuiz === null,
    });
  }

  return items;
}

/**
 * Evaluates a spaced repetition review quiz attempt, updates SM-2 schedule,
 * and detects lapses requiring refresher material.
 */
export async function submitReviewAttempt(
  ownerId: string,
  quizId: string,
  submission: QuizSubmission,
  customJudge?: LlmJudge,
): Promise<ReviewSubmissionResult> {
  const quiz = await getQuizById(ownerId, quizId);
  if (!quiz) {
    throw new LMSValidationError(`Review quiz "${quizId}" not found.`);
  }

  if (quiz.quiz_purpose !== "spaced_repetition") {
    throw new LMSValidationError(`Quiz "${quizId}" is not a spaced repetition review quiz.`);
  }

  if (!quiz.node_id) {
    throw new LMSValidationError(`Spaced repetition quiz has no linked node.`);
  }

  const node = await getNodeById(ownerId, quiz.node_id);
  const existingSrs = await getSpacedRepetition(ownerId, quiz.node_id);

  // 1. Grade quiz polymorphically
  const grading = await gradeQuiz(quiz, submission, customJudge);

  // 2. Map to SM-2 quality grade q (0..5)
  const qualityGrade = mapScoreToQualityGrade(quiz.quiz_type, grading.passed, grading.score);
  const passed = qualityGrade >= 3;

  // 3. Compute updated SM-2 schedule
  const srsResult = scheduleReview(
    existingSrs
      ? {
          reps: existingSrs.reps,
          lapses: existingSrs.lapses,
          intervalDays: existingSrs.interval_days,
          easinessFactor: existingSrs.stability,
        }
      : undefined,
    qualityGrade,
  );

  // 4. Persist updated SRS record
  await upsertSpacedRepetition(ownerId, quiz.subject_id, quiz.node_id, {
    stability: srsResult.easinessFactor,
    difficulty: existingSrs?.difficulty ?? 2.5,
    reps: srsResult.reps,
    lapses: srsResult.lapses,
    intervalDays: srsResult.intervalDays,
    lastReviewedAt: srsResult.lastReviewedAt,
    nextReviewAt: srsResult.nextReviewAt,
  });

  // 5. Update quiz submission
  await submitQuizResult(ownerId, quiz.id, {
    userSubmission: submission,
    passed,
    score: grading.score,
    agentFeedback: grading.feedback,
  });

  // 6. On lapse, retrieve refresher excerpts
  let refresherExcerpts: RagSearchResult[] = [];
  if (srsResult.needsRefresher && node) {
    try {
      refresherExcerpts = await searchRag({
        ownerId,
        subjectSlug: "",
        query: `${node.title} ${node.summary} review refresher`,
        difficultyLevel: node.difficulty_level,
        limit: 3,
      });
    } catch {
      refresherExcerpts = [];
    }
  }

  return {
    passed,
    qualityGrade,
    gradingScore: grading.score,
    feedback: grading.feedback,
    srsResult,
    refresherExcerpts: refresherExcerpts.length > 0 ? refresherExcerpts : undefined,
  };
}

/**
 * Computes the trailing retention rate for a subject.
 * Returns null if no reviews have been completed yet.
 */
export async function getRetentionRate(
  ownerId: string,
  subjectId: string,
  trailingDays: number = 30,
): Promise<number | null> {
  const sinceDate = new Date(Date.now() - trailingDays * 24 * 60 * 60 * 1000);
  const stats = await getSubjectReviewStats(ownerId, subjectId, sinceDate);

  if (stats.total === 0) return null;
  return Math.round((stats.passed / stats.total) * 1000) / 10;
}

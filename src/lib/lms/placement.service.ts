import type {
  PlacementSessionRow,
  QuizRow,
  QuizSubmission,
  PlacementHistoryStep,
} from "./types";
import {
  getSubjectBySlug,
  getSubjectById,
  updateSubjectStatus,
  createPlacementSession,
  getPlacementSession,
  updatePlacementStep,
  listQuizzesForSubject,
  getQuizById,
  submitQuizResult,
  listNodes,
  listNodeEdges,
  updateNodesStatus,
} from "./repo";
import { stepBinarySearchPlacement } from "./placement";
import { gradeQuiz, stripAnswerKey, type GradingResult, type LlmJudge } from "./grading";
import { unlockedNodes } from "./dag";
import { LMSValidationError, PlacementBankIncompleteError } from "./subjects";

export interface PlacementStepOutput {
  done: boolean;
  resolvedLevel: number | null;
  grading: GradingResult;
  session: PlacementSessionRow;
  question: QuizRow | null;
}

export interface PlacementStartOutput {
  session: PlacementSessionRow;
  question: QuizRow;
}

/**
 * Initiates or restarts a placement diagnostic session for a subject.
 * Verifies the placement question bank covers all tiers 1..N.
 */
export async function startPlacementSession(
  ownerId: string,
  subjectSlug: string,
): Promise<PlacementStartOutput> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  // 1. Verify quiz bank covers all tiers 1..N
  const quizzes = await listQuizzesForSubject(ownerId, subject.id, "placement");
  const coveredTiers = new Set(quizzes.map((q) => q.difficulty_level));
  const missingTiers: number[] = [];
  for (let t = 1; t <= subject.difficulty_scale_n; t++) {
    if (!coveredTiers.has(t)) {
      missingTiers.push(t);
    }
  }

  if (missingTiers.length > 0) {
    throw new PlacementBankIncompleteError(missingTiers);
  }

  // 2. Ensure subject status is 'placement' if it was 'researching'
  if (subject.status === "researching") {
    await updateSubjectStatus(ownerId, subject.id, "placement");
  }

  // 3. Compute initial bounds
  const low = 1;
  const high = subject.difficulty_scale_n;
  const mid = Math.floor((low + high) / 2);

  // 4. Create new placement session
  const session = await createPlacementSession(ownerId, subject.id, {
    lowBound: low,
    highBound: high,
    currentMid: mid,
  });

  // 5. Select question for initial midpoint
  const midQuizzes = quizzes.filter((q) => q.difficulty_level === mid);
  const selectedQuiz = midQuizzes[0];
  const safeQuiz: QuizRow = {
    ...selectedQuiz,
    prompt_payload: stripAnswerKey(selectedQuiz.prompt_payload),
  };

  return {
    session,
    question: safeQuiz,
  };
}

/**
 * Submits an answer to the current diagnostic placement question.
 * Enforces idempotency (replaying returns stored results), checks question midpoint alignment,
 * grades submission, steps the binary search, and on completion marks entry level and unlocks earlier nodes.
 */
export async function submitPlacementStep(
  ownerId: string,
  sessionId: string,
  params: {
    quizId: string;
    submission: QuizSubmission;
  },
  customJudge?: LlmJudge,
): Promise<PlacementStepOutput> {
  const session = await getPlacementSession(ownerId, sessionId);
  if (!session) {
    throw new LMSValidationError(`Placement session "${sessionId}" not found.`);
  }

  const subject = await getSubjectById(ownerId, session.subject_id);
  if (!subject) {
    throw new LMSValidationError(`Subject for placement session not found.`);
  }

  // Idempotency: Replay of same quiz submission returns stored result without advancing bounds
  const existingStep = session.history.find((h) => h.quizId === params.quizId);
  if (existingStep) {
    const replayGrading: GradingResult = {
      passed: existingStep.passed,
      score: existingStep.passed ? 1.0 : 0.0,
      feedback: "Idempotent replay: step was already processed.",
    };

    if (session.status === "completed") {
      return {
        done: true,
        resolvedLevel: session.resolved_level,
        grading: replayGrading,
        session,
        question: null,
      };
    }

    const allQuizzes = await listQuizzesForSubject(ownerId, subject.id, "placement");
    const midQuiz = allQuizzes.find((q) => q.difficulty_level === session.current_mid);
    return {
      done: false,
      resolvedLevel: null,
      grading: replayGrading,
      session,
      question: midQuiz
        ? { ...midQuiz, prompt_payload: stripAnswerKey(midQuiz.prompt_payload) }
        : null,
    };
  }

  if (session.status === "completed") {
    throw new LMSValidationError("Placement session is already completed.");
  }

  const quiz = await getQuizById(ownerId, params.quizId);
  if (!quiz || quiz.subject_id !== subject.id) {
    throw new LMSValidationError(`Quiz "${params.quizId}" not found for this subject.`);
  }

  if (quiz.quiz_purpose !== "placement") {
    throw new LMSValidationError(`Quiz "${params.quizId}" is not a placement diagnostic question.`);
  }

  if (quiz.difficulty_level !== session.current_mid) {
    throw new LMSValidationError(
      `Quiz difficulty (${quiz.difficulty_level}) does not match current session midpoint (${session.current_mid}).`,
    );
  }

  // Grade quiz
  const grading = await gradeQuiz(quiz, params.submission, customJudge);
  await submitQuizResult(ownerId, quiz.id, {
    userSubmission: params.submission,
    passed: grading.passed,
    score: grading.score,
    agentFeedback: grading.feedback,
  });

  // Calculate binary search step
  const currentEntryLevel = session.history.reduce(
    (acc, step) => (step.passed ? Math.max(acc, step.difficultyTested + 1) : acc),
    1,
  );

  const stepResult = stepBinarySearchPlacement(
    {
      low: session.low_bound,
      high: session.high_bound,
      entryLevel: currentEntryLevel,
      maxTiers: subject.difficulty_scale_n,
    },
    grading.passed,
  );

  const stepRecord: PlacementHistoryStep = {
    stepIndex: session.history.length,
    difficultyTested: session.current_mid,
    quizId: quiz.id,
    passed: grading.passed,
    lowBefore: session.low_bound,
    highBefore: session.high_bound,
    lowAfter: stepResult.nextState.low,
    highAfter: stepResult.nextState.high,
  };

  const nextHistory = [...session.history, stepRecord];

  if (stepResult.done) {
    const resolvedLevel = stepResult.entryLevel;

    const updatedSession = await updatePlacementStep(ownerId, session.id, {
      lowBound: stepResult.nextState.low,
      highBound: stepResult.nextState.high,
      currentMid: session.current_mid,
      resolvedLevel,
      status: "completed",
      history: nextHistory,
    });

    // Update subject status to active with entry difficulty level
    await updateSubjectStatus(ownerId, subject.id, "active", resolvedLevel);

    // Auto-mark nodes with difficulty_level < entry as mastered_by_placement
    const allNodes = await listNodes(ownerId, subject.id);
    const nodesToMaster = allNodes.filter(
      (n) => n.difficulty_level < resolvedLevel && n.status !== "completed",
    );
    if (nodesToMaster.length > 0) {
      await updateNodesStatus(
        ownerId,
        subject.id,
        nodesToMaster.map((n) => n.id),
        "mastered_by_placement",
      );
    }

    // Unlock dependent nodes whose prerequisites are now satisfied
    const refreshedNodes = await listNodes(ownerId, subject.id);
    const edges = await listNodeEdges(ownerId, subject.id);
    const unlockableIds = unlockedNodes(
      refreshedNodes.map((n) => ({ id: n.id, status: n.status })),
      edges.map((e) => ({ nodeId: e.node_id, dependsOnNodeId: e.depends_on_node_id })),
    );

    const nodesToUnlock = refreshedNodes.filter(
      (n) => unlockableIds.includes(n.id) && n.status === "locked",
    );
    if (nodesToUnlock.length > 0) {
      await updateNodesStatus(
        ownerId,
        subject.id,
        nodesToUnlock.map((n) => n.id),
        "unlocked",
      );
    }

    return {
      done: true,
      resolvedLevel,
      grading,
      session: updatedSession!,
      question: null,
    };
  }

  // Not done: Advance to next midpoint
  const nextMid = stepResult.nextMid!;
  const updatedSession = await updatePlacementStep(ownerId, session.id, {
    lowBound: stepResult.nextState.low,
    highBound: stepResult.nextState.high,
    currentMid: nextMid,
    history: nextHistory,
  });

  const allQuizzes = await listQuizzesForSubject(ownerId, subject.id, "placement");
  const nextTierQuizzes = allQuizzes.filter((q) => q.difficulty_level === nextMid);
  const nextQuiz = nextTierQuizzes[0];

  return {
    done: false,
    resolvedLevel: null,
    grading,
    session: updatedSession!,
    question: nextQuiz
      ? { ...nextQuiz, prompt_payload: stripAnswerKey(nextQuiz.prompt_payload) }
      : null,
  };
}

/**
 * Allows retaking the placement diagnostic, starting a fresh session.
 */
export async function retakePlacement(
  ownerId: string,
  subjectSlug: string,
): Promise<PlacementStartOutput> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  await updateSubjectStatus(ownerId, subject.id, "placement");
  return await startPlacementSession(ownerId, subjectSlug);
}

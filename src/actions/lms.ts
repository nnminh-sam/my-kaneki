"use server";

import { revalidatePath } from "next/cache";
import { currentOwnerId } from "@/lib/owner";
import {
  getQuizById,
  getSubjectById,
  getSubjectBySlug,
  getPlacementSession,
  getSourceById,
} from "@/lib/lms/repo";
import { submitQuizAttempt } from "@/lib/lms/quiz.service";
import { submitReviewAttempt } from "@/lib/lms/review.service";
import {
  startPlacementSession,
  submitPlacementStep,
} from "@/lib/lms/placement.service";
import { resolveResearchEscalation } from "@/lib/lms/research";
import { removeSubjectSourceMetadata } from "@/lib/lms/github-knowledge";
import { deleteFile } from "@/actions/github";
import { getDb } from "@/lib/db";
import type { QuizSubmission } from "@/lib/lms/types";

export interface SubmitQuizActionResult {
  ok: boolean;
  error?: string;
  purpose?: "placement" | "mastery_gate" | "spaced_repetition";
  passed?: boolean;
  score?: number;
  feedback?: string;
  newlyUnlockedNodeIds?: string[];
  nextQuestionId?: string | null;
  placementDone?: boolean;
  resolvedLevel?: number | null;
}

export async function submitQuizAction(input: {
  quizId: string;
  submission: QuizSubmission;
}): Promise<SubmitQuizActionResult> {
  const owner = await currentOwnerId();
  if (owner === null) {
    return { ok: false, error: "Unauthorized" };
  }

  const quiz = await getQuizById(owner, input.quizId);
  if (!quiz) {
    return { ok: false, error: "Quiz not found" };
  }

  const subject = await getSubjectById(owner, quiz.subject_id);
  const subjectSlug = subject ? subject.slug : "";

  try {
    if (quiz.quiz_purpose === "placement") {
      let sessionId = quiz.placement_session_id;
      if (!sessionId) {
        // Fallback: look up in-progress placement session for subject
        const rows = await getDb().query(
          `select id from lms_placement_sessions where subject_id = $1 order by created_at desc limit 1`,
          [quiz.subject_id],
        );
        if (rows.length > 0) {
          sessionId = String(rows[0].id);
        }
      }

      if (!sessionId) {
        return { ok: false, error: "Placement session not found for this quiz." };
      }

      const stepOutput = await submitPlacementStep(owner, sessionId, {
        quizId: input.quizId,
        submission: input.submission,
      });

      if (subjectSlug) {
        revalidatePath(`/learning/${subjectSlug}`);
      }

      return {
        ok: true,
        purpose: "placement",
        passed: stepOutput.grading.passed,
        score: stepOutput.grading.score,
        feedback: stepOutput.grading.feedback,
        placementDone: stepOutput.done,
        resolvedLevel: stepOutput.resolvedLevel,
        nextQuestionId: stepOutput.question ? stepOutput.question.id : null,
      };
    }

    if (quiz.quiz_purpose === "spaced_repetition") {
      const reviewResult = await submitReviewAttempt(
        owner,
        input.quizId,
        input.submission,
      );

      if (subjectSlug) {
        revalidatePath(`/learning/${subjectSlug}`);
        revalidatePath(`/learning/${subjectSlug}/review`);
      }

      return {
        ok: true,
        purpose: "spaced_repetition",
        passed: reviewResult.passed,
        score: reviewResult.gradingScore,
        feedback: reviewResult.feedback,
      };
    }

    // mastery_gate
    const gateResult = await submitQuizAttempt(
      owner,
      input.quizId,
      input.submission,
    );

    if (subjectSlug) {
      revalidatePath(`/learning/${subjectSlug}`);
    }

    return {
      ok: true,
      purpose: "mastery_gate",
      passed: gateResult.passed,
      score: gateResult.score,
      feedback: gateResult.feedback,
      newlyUnlockedNodeIds: gateResult.newlyUnlockedNodeIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function startPlacementAction(subjectSlug: string) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    const result = await startPlacementSession(owner, subjectSlug);
    revalidatePath(`/learning/${subjectSlug}`);
    return {
      ok: true,
      sessionId: result.session.id,
      questionId: result.question.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function resolveEscalationAction(input: {
  sourceId: string;
  decision: "approve_override" | "edit_and_approve" | "reject";
  editedMarkdown?: string;
  notes?: string;
}) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    const updatedSource = await resolveResearchEscalation(
      owner,
      input.sourceId,
      {
        userDecision: input.decision,
        editedMarkdown: input.editedMarkdown,
        userNotes: input.notes || "Human resolution recorded via UI",
      },
    );

    const subject = await getSubjectById(owner, updatedSource.subject_id);
    if (subject) {
      revalidatePath(`/learning/${subject.slug}`);
      revalidatePath(`/learning/${subject.slug}/research`);
    }

    return { ok: true, source: updatedSource };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function deleteSourceAction(sourceId: string) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return { ok: false, error: "Unauthorized" };
  }

  const source = await getSourceById(owner, sourceId);
  if (!source) {
    return { ok: false, error: "Source not found" };
  }

  const db = getDb();
  await db.transaction([
    { text: `delete from lms_rag_chunks where source_id = $1`, params: [sourceId] },
    { text: `delete from lms_sources where id = $1`, params: [sourceId] },
  ]);

  const subjectRows = await db.query(
    `select slug from lms_subjects where id = $1`,
    [source.subject_id],
  );

  if (subjectRows.length > 0) {
    const slug = String(subjectRows[0].slug);
    const filename = source.title || source.original_uri;
    await removeSubjectSourceMetadata(slug, filename).catch(() => {});
    if (source.github_md_path) {
      await deleteFile(source.github_md_path, source.file_sha || undefined).catch(() => {});
    }
    revalidatePath(`/learning/${slug}/sources`);
  }

  return { ok: true };
}

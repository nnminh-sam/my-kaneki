import type { SubjectRow, SubjectStatus, CapstoneProject } from "./types";
import {
  createSubject,
  getSubjectBySlug,
  updateSubjectStatus,
  listSources,
  listQuizzesForSubject,
  listNodes,
  countDueReviewsForSubject,
  getSubjectReviewStats,
} from "./repo";

export class LMSValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LMSValidationError";
  }
}

export class PlacementBankIncompleteError extends LMSValidationError {
  constructor(public readonly missingTiers: number[]) {
    super(
      `Placement quiz bank incomplete. Missing questions for difficulty tiers: ${missingTiers.join(", ")}`,
    );
    this.name = "PlacementBankIncompleteError";
  }
}

export interface SubjectOverview {
  subject: SubjectRow;
  nodes: {
    total: number;
    completed: number;
    masteredByPlacement: number;
    inProgress: number;
    unlocked: number;
    locked: number;
  };
  progressPercentage: number;
  capstone: {
    totalMilestones: number;
    completedMilestones: number;
    milestonesProgressPercentage: number;
  };
  srs: {
    dueReviewsCount: number;
    retentionRate: number | null;
  };
}

/**
 * Sanitizes a string into a URL-friendly slug.
 */
export function generateSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "subject";
}

/**
 * Creates a new learning subject with difficulty scale 1..N and initial status 'researching'.
 */
export async function createLearningSubject(
  ownerId: string,
  params: {
    title: string;
    slug?: string;
    difficultyScaleN?: number;
    capstoneProject?: CapstoneProject;
  },
): Promise<SubjectRow> {
  const title = params.title.trim();
  if (!title) {
    throw new LMSValidationError("Subject title cannot be empty.");
  }

  const baseSlug = params.slug ? generateSlug(params.slug) : generateSlug(title);
  let finalSlug = baseSlug;

  const existingWithBase = await getSubjectBySlug(ownerId, baseSlug);
  if (existingWithBase) {
    if (params.slug) {
      throw new LMSValidationError(
        `Subject slug "${params.slug}" already exists for this owner.`,
      );
    }
    // Auto-generate a unique suffix
    let counter = 2;
    while (await getSubjectBySlug(ownerId, `${baseSlug}-${counter}`)) {
      counter++;
    }
    finalSlug = `${baseSlug}-${counter}`;
  }

  const scaleN = params.difficultyScaleN ?? 16;
  if (scaleN < 1) {
    throw new LMSValidationError("difficultyScaleN must be at least 1.");
  }

  return await createSubject(ownerId, {
    title,
    slug: finalSlug,
    difficultyScaleN: scaleN,
    capstoneProject: params.capstoneProject,
  });
}

/**
 * Transitions subject status across the lifecycle with guarded prerequisites:
 * researching -> placement: Requires >= 1 validated source and full placement quiz coverage 1..N
 * placement -> active: Requires entry_difficulty_level resolved
 * active -> completed: Requires all nodes completed or mastered_by_placement (and at least 1 node)
 */
export async function transitionSubjectStatus(
  ownerId: string,
  subjectSlug: string,
  targetStatus: SubjectStatus,
): Promise<SubjectRow> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  if (subject.status === targetStatus) {
    return subject;
  }

  if (targetStatus === "placement") {
    // 1. Check validated sources
    const sources = await listSources(ownerId, subject.id);
    const validatedSources = sources.filter((s) => s.validation_status === "validated");
    if (validatedSources.length === 0) {
      throw new LMSValidationError("Cannot transition to placement: zero validated sources.");
    }

    // 2. Check placement quiz bank
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
  } else if (targetStatus === "active") {
    if (subject.entry_difficulty_level === null || subject.entry_difficulty_level === undefined) {
      throw new LMSValidationError(
        "Cannot transition to active: placement not completed (entry difficulty level unresolved).",
      );
    }
  } else if (targetStatus === "completed") {
    const nodes = await listNodes(ownerId, subject.id);
    if (nodes.length === 0) {
      throw new LMSValidationError("Cannot transition to completed: learning path contains no nodes.");
    }
    const incompleteNodes = nodes.filter(
      (n) => n.status !== "completed" && n.status !== "mastered_by_placement",
    );
    if (incompleteNodes.length > 0) {
      throw new LMSValidationError(
        `Cannot transition to completed: ${incompleteNodes.length} incomplete node(s) remaining.`,
      );
    }
  }

  const updated = await updateSubjectStatus(ownerId, subject.id, targetStatus);
  if (!updated) {
    throw new Error(`Failed to update status for subject "${subjectSlug}".`);
  }
  return updated;
}

/**
 * Computes live, dynamic subject overview: progress, node status distribution,
 * capstone milestone status, and SRS retention metrics.
 */
export async function getSubjectOverview(
  ownerId: string,
  subjectSlug: string,
): Promise<SubjectOverview> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  const nodes = await listNodes(ownerId, subject.id);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const counts = {
    total: nodes.length,
    completed: 0,
    masteredByPlacement: 0,
    inProgress: 0,
    unlocked: 0,
    locked: 0,
  };

  for (const n of nodes) {
    if (n.status === "completed") counts.completed++;
    else if (n.status === "mastered_by_placement") counts.masteredByPlacement++;
    else if (n.status === "in_progress") counts.inProgress++;
    else if (n.status === "unlocked") counts.unlocked++;
    else if (n.status === "locked") counts.locked++;
  }

  const progressPercentage =
    counts.total === 0
      ? 0
      : Math.round(((counts.completed + counts.masteredByPlacement) / counts.total) * 100);

  // Capstone milestones calculation
  let totalMilestones = 0;
  let completedMilestones = 0;

  const capstoneMilestones = subject.capstone_project?.milestones ?? [];
  if (capstoneMilestones.length > 0) {
    totalMilestones = capstoneMilestones.length;
    for (const m of capstoneMilestones) {
      if (m.completed) {
        completedMilestones++;
      } else if (m.targetNodeId) {
        const targetNode = nodeMap.get(m.targetNodeId);
        if (
          targetNode &&
          (targetNode.status === "completed" || targetNode.status === "mastered_by_placement")
        ) {
          completedMilestones++;
        }
      }
    }
  } else {
    // Derive from nodes with project_milestone set
    const milestoneNodes = nodes.filter((n) => Boolean(n.project_milestone && n.project_milestone.trim()));
    totalMilestones = milestoneNodes.length;
    completedMilestones = milestoneNodes.filter(
      (n) => n.status === "completed" || n.status === "mastered_by_placement",
    ).length;
  }

  const milestonesProgressPercentage =
    totalMilestones === 0 ? 0 : Math.round((completedMilestones / totalMilestones) * 100);

  // Spaced Repetition Metrics
  const dueReviewsCount = await countDueReviewsForSubject(ownerId, subject.id);
  const reviewStats = await getSubjectReviewStats(ownerId, subject.id);
  const retentionRate =
    reviewStats.total === 0
      ? null
      : Math.round((reviewStats.passed / reviewStats.total) * 1000) / 10;

  return {
    subject,
    nodes: counts,
    progressPercentage,
    capstone: {
      totalMilestones,
      completedMilestones,
      milestonesProgressPercentage,
    },
    srs: {
      dueReviewsCount,
      retentionRate,
    },
  };
}

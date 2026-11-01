import type {
  SourceValidationStatus,
  SourcePerspective,
  ResearchDebateTurn,
} from "./types";
import { validateCitations } from "./citations";

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ResearchMachineState {
  validationStatus: SourceValidationStatus;
  reviewRound: number; // 0..3
  debateHistory: ResearchDebateTurn[];
  currentDraftMarkdown?: string;
}

export interface SubmitDraftInput {
  title?: string;
  draftMarkdown: string;
  requiredPerspectives?: SourcePerspective[];
  coveredPerspectives?: SourcePerspective[];
  citations: string[];
  defenseArgument?: string;
  nowIso?: string;
}

export interface ValidateDraftInput {
  decision: "accept" | "raise_issues";
  critiqueSummary: string;
  defects?: string[];
  requiredPerspectives?: SourcePerspective[];
  coveredPerspectives?: SourcePerspective[];
  citations?: string[];
  nowIso?: string;
}

export interface ResolveEscalationInput {
  userDecision: "approve_override" | "edit_and_approve" | "reject";
  userNotes: string;
  editedMarkdown?: string;
  nowIso?: string;
}

export const MAX_REVIEW_ROUNDS = 3;

/**
 * Pure state machine transition: research agent submits an initial draft or revised defense.
 */
export function transitionSubmitDraft(
  state: ResearchMachineState,
  input: SubmitDraftInput,
): ResearchMachineState {
  const now = input.nowIso ?? new Date().toISOString();

  if (state.validationStatus === "escalated_to_user") {
    throw new InvalidTransitionError(
      `Research session reached the ${MAX_REVIEW_ROUNDS}-round review limit and is escalated to user. Research agent must stop.`,
    );
  }

  if (state.validationStatus === "validated") {
    throw new InvalidTransitionError("Research session is already validated.");
  }

  if (state.validationStatus === "rejected") {
    throw new InvalidTransitionError("Research session is already rejected.");
  }

  if (state.reviewRound >= MAX_REVIEW_ROUNDS) {
    throw new InvalidTransitionError(
      `Cannot submit draft: Maximum review rounds (${MAX_REVIEW_ROUNDS}) exceeded.`,
    );
  }

  // Citation check
  const citationCheck = validateCitations(input.draftMarkdown, input.citations);
  if (!citationCheck.valid) {
    throw new ValidationError(`Citation defects: ${citationCheck.defects.join("; ")}`);
  }

  const isRevision = state.reviewRound > 0;
  const turnRound = state.reviewRound + 1;

  const nextTurn: ResearchDebateTurn = {
    round: turnRound,
    actor: "research_agent",
    action: isRevision ? "defend_and_revise" : "submit_draft",
    summary: isRevision
      ? `Submitted revised draft${input.defenseArgument ? " with defense argument" : ""}.`
      : "Submitted initial multi-perspective research draft.",
    defenseArgument: input.defenseArgument,
    citations: input.citations,
    timestamp: now,
  };

  return {
    validationStatus: "in_review",
    reviewRound: state.reviewRound, // Review round is finalized by validation agent
    debateHistory: [...state.debateHistory, nextTurn],
    currentDraftMarkdown: input.draftMarkdown,
  };
}

/**
 * Pure state machine transition: validation agent evaluates the draft.
 */
export function transitionValidateDraft(
  state: ResearchMachineState,
  input: ValidateDraftInput,
): ResearchMachineState {
  const now = input.nowIso ?? new Date().toISOString();

  if (state.validationStatus !== "in_review") {
    throw new InvalidTransitionError(
      `Cannot validate: session is in status "${state.validationStatus}", expected "in_review".`,
    );
  }

  const nextRound = state.reviewRound + 1;
  const autoDefects: string[] = [];

  // Check required perspectives if specified
  if (input.requiredPerspectives && input.requiredPerspectives.length > 0) {
    const covered = input.coveredPerspectives ?? [];
    const missing = input.requiredPerspectives.filter((p) => !covered.includes(p));
    if (missing.length > 0) {
      autoDefects.push(`Missing required perspectives: ${missing.join(", ")}`);
    }
  }

  // Check citations
  const citations = input.citations ?? [];
  if (citations.length === 0) {
    autoDefects.push("No source citations provided.");
  }

  const combinedDefects = [...autoDefects, ...(input.defects ?? [])];
  const passed = input.decision === "accept" && autoDefects.length === 0;

  const turn: ResearchDebateTurn = {
    round: nextRound,
    actor: "validation_agent",
    action: passed ? "accept" : "raise_issues",
    summary: input.critiqueSummary,
    defects: passed ? [] : combinedDefects,
    timestamp: now,
  };

  let nextStatus: SourceValidationStatus;

  if (passed) {
    nextStatus = "validated";
  } else if (nextRound >= MAX_REVIEW_ROUNDS) {
    nextStatus = "escalated_to_user";
  } else {
    nextStatus = "pending";
  }

  return {
    validationStatus: nextStatus,
    reviewRound: nextRound,
    debateHistory: [...state.debateHistory, turn],
    currentDraftMarkdown: state.currentDraftMarkdown,
  };
}

/**
 * Pure state machine transition: human user makes the final decision on an escalated debate.
 */
export function transitionResolveEscalation(
  state: ResearchMachineState,
  input: ResolveEscalationInput,
): ResearchMachineState {
  const now = input.nowIso ?? new Date().toISOString();

  if (state.validationStatus !== "escalated_to_user") {
    throw new InvalidTransitionError(
      `Cannot resolve escalation: session is in status "${state.validationStatus}", expected "escalated_to_user".`,
    );
  }

  const isApproved =
    input.userDecision === "approve_override" || input.userDecision === "edit_and_approve";

  const turn: ResearchDebateTurn = {
    round: state.reviewRound,
    actor: "user",
    action: isApproved ? "user_override_approve" : "user_reject",
    summary: input.userNotes,
    timestamp: now,
  };

  return {
    validationStatus: isApproved ? "validated" : "rejected",
    reviewRound: state.reviewRound,
    debateHistory: [...state.debateHistory, turn],
    currentDraftMarkdown: input.editedMarkdown ?? state.currentDraftMarkdown,
  };
}

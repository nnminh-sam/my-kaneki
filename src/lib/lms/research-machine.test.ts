import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  transitionSubmitDraft,
  transitionValidateDraft,
  transitionResolveEscalation,
  InvalidTransitionError,
  ValidationError,
  type ResearchMachineState,
} from "./research-machine";

describe("Research & Validation State Machine (Pure)", () => {
  const initialCitations = ["Paper A https://example.com/a [1]"];

  it("handles happy path: approved on Round 1", () => {
    let state: ResearchMachineState = {
      validationStatus: "pending",
      reviewRound: 0,
      debateHistory: [],
    };

    // 1. Research agent submits draft
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Overview of Raft [1].",
      citations: initialCitations,
    });

    assert.equal(state.validationStatus, "in_review");
    assert.equal(state.reviewRound, 0);
    assert.equal(state.debateHistory.length, 1);
    assert.equal(state.debateHistory[0].actor, "research_agent");
    assert.equal(state.debateHistory[0].action, "submit_draft");

    // 2. Validation agent accepts
    state = transitionValidateDraft(state, {
      decision: "accept",
      critiqueSummary: "Well-sourced and balanced.",
      citations: initialCitations,
    });

    assert.equal(state.validationStatus, "validated");
    assert.equal(state.reviewRound, 1);
    assert.equal(state.debateHistory.length, 2);
    assert.equal(state.debateHistory[1].actor, "validation_agent");
    assert.equal(state.debateHistory[1].action, "accept");
  });

  it("handles 2-round peer review with revision and defense", () => {
    let state: ResearchMachineState = {
      validationStatus: "pending",
      reviewRound: 0,
      debateHistory: [],
    };

    // Round 1 submit
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Initial draft [1].",
      citations: initialCitations,
    });

    // Round 1 critique: issues raised
    state = transitionValidateDraft(state, {
      decision: "raise_issues",
      critiqueSummary: "Vague claims on failure modes.",
      defects: ["Clarify split-brain handling."],
      citations: initialCitations,
    });

    assert.equal(state.validationStatus, "pending");
    assert.equal(state.reviewRound, 1);

    // Round 2 submit with defense
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Revised draft clarifying quorum safety [1].",
      citations: initialCitations,
      defenseArgument: "Section 5.4 proves election safety prevents split-brain.",
    });

    assert.equal(state.validationStatus, "in_review");
    assert.equal(state.debateHistory[2].action, "defend_and_revise");
    assert.equal(
      state.debateHistory[2].defenseArgument,
      "Section 5.4 proves election safety prevents split-brain.",
    );

    // Round 2 validation accepts defense
    state = transitionValidateDraft(state, {
      decision: "accept",
      critiqueSummary: "Defense substantiated by quorum theorem.",
      citations: initialCitations,
    });

    assert.equal(state.validationStatus, "validated");
    assert.equal(state.reviewRound, 2);
  });

  it("escalates to user after Round 3 issues", () => {
    let state: ResearchMachineState = {
      validationStatus: "pending",
      reviewRound: 0,
      debateHistory: [],
    };

    // Round 1
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Draft R1 [1].",
      citations: initialCitations,
    });
    state = transitionValidateDraft(state, {
      decision: "raise_issues",
      critiqueSummary: "Defects in R1",
      defects: ["D1"],
      citations: initialCitations,
    });
    assert.equal(state.reviewRound, 1);

    // Round 2
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Draft R2 [1].",
      citations: initialCitations,
      defenseArgument: "Defense R2",
    });
    state = transitionValidateDraft(state, {
      decision: "raise_issues",
      critiqueSummary: "Defects in R2",
      defects: ["D2"],
      citations: initialCitations,
    });
    assert.equal(state.reviewRound, 2);

    // Round 3
    state = transitionSubmitDraft(state, {
      draftMarkdown: "Draft R3 [1].",
      citations: initialCitations,
      defenseArgument: "Defense R3",
    });
    state = transitionValidateDraft(state, {
      decision: "raise_issues",
      critiqueSummary: "Unresolved issues after 3 rounds.",
      defects: ["D3"],
      citations: initialCitations,
    });

    assert.equal(state.reviewRound, 3);
    assert.equal(state.validationStatus, "escalated_to_user");

    // Research agent is strictly blocked from continuing while escalated
    assert.throws(() => {
      transitionSubmitDraft(state, {
        draftMarkdown: "Draft R4 [1].",
        citations: initialCitations,
      });
    }, InvalidTransitionError);

    // Human user resolves escalation by overriding and approving
    const resolved = transitionResolveEscalation(state, {
      userDecision: "approve_override",
      userNotes: "Learner reviewed debate and accepts theoretical trade-offs.",
    });

    assert.equal(resolved.validationStatus, "validated");
    assert.equal(resolved.debateHistory[resolved.debateHistory.length - 1].actor, "user");
  });

  it("handles user rejection on escalation", () => {
    const escalatedState: ResearchMachineState = {
      validationStatus: "escalated_to_user",
      reviewRound: 3,
      debateHistory: [],
      currentDraftMarkdown: "Disputed draft.",
    };

    const rejected = transitionResolveEscalation(escalatedState, {
      userDecision: "reject",
      userNotes: "Topic lacks primary documentation.",
    });

    assert.equal(rejected.validationStatus, "rejected");
  });

  it("handles user edit_and_approve with edited markdown", () => {
    const escalatedState: ResearchMachineState = {
      validationStatus: "escalated_to_user",
      reviewRound: 3,
      debateHistory: [],
      currentDraftMarkdown: "Old draft.",
    };

    const edited = transitionResolveEscalation(escalatedState, {
      userDecision: "edit_and_approve",
      userNotes: "Fixed disputed paragraph manually.",
      editedMarkdown: "New manually edited draft.",
    });

    assert.equal(edited.validationStatus, "validated");
    assert.equal(edited.currentDraftMarkdown, "New manually edited draft.");
  });

  it("rejects invalid citations during draft submission", () => {
    const state: ResearchMachineState = {
      validationStatus: "pending",
      reviewRound: 0,
      debateHistory: [],
    };

    assert.throws(() => {
      transitionSubmitDraft(state, {
        draftMarkdown: "Claim without references.",
        citations: [],
      });
    }, ValidationError);
  });
});

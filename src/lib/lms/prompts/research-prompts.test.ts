import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderOrchestrateResearchPrompt,
  renderResearchAgentPrompt,
  renderValidationAgentPrompt,
} from "./research-prompts";

describe("LMS Research Prompts Content", () => {
  it("renders orchestrator prompt containing strict 3-round limit and escalation rule", () => {
    const text = renderOrchestrateResearchPrompt({
      subjectTitle: "Raft in Go",
      subjectSlug: "raft-go",
      topicTitle: "Leader Election Timers",
      requiredPerspectives: ["theory", "practical", "critique"],
      currentRound: 1,
    });

    assert.ok(text.includes("STRICT ROUND LIMIT: You may conduct up to 3 rounds"));
    assert.ok(text.includes("HUMAN ESCALATION BOUNDARY"));
    assert.ok(text.includes("Leader Election Timers"));
  });

  it("renders revision research prompt instructing defense and not blindly overwriting", () => {
    const text = renderResearchAgentPrompt({
      subjectTitle: "Raft in Go",
      topicTitle: "WAL Disk Framing",
      requiredPerspectives: ["theory", "practical"],
      currentRound: 2,
      priorDefects: ["Missing CRC32 corruption recovery."],
    });

    assert.ok(text.includes("DEFENSE & REVISION MANDATE (Round 2)"));
    assert.ok(text.includes("Missing CRC32 corruption recovery."));
    assert.ok(text.includes("rather than blindly overwriting"));
  });

  it("renders validation prompt evaluating defense arguments", () => {
    const text = renderValidationAgentPrompt({
      topicTitle: "WAL Disk Framing",
      draftMarkdown: "# WAL Framing",
      citations: ["https://example.com/raft.pdf"],
      currentRound: 2,
      defenseArgument: "CRC32 checksum prevents torn writes under ungraceful power loss.",
    });

    assert.ok(text.includes("Evaluate this defense with an open mind"));
    assert.ok(text.includes("CRC32 checksum prevents torn writes"));
  });
});

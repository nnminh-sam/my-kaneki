import type { SourcePerspective } from "../types";

export interface OrchestratorPromptParams {
  subjectTitle: string;
  subjectSlug: string;
  topicTitle: string;
  requiredPerspectives: SourcePerspective[];
  currentRound: number;
  maxRounds?: number;
}

export function renderOrchestrateResearchPrompt(params: OrchestratorPromptParams): string {
  const max = params.maxRounds ?? 3;
  return `
You are the LMS Orchestrator Agent responsible for curating foundational knowledge for "${params.subjectTitle}".

TOPIC TO RESEARCH:
"${params.topicTitle}" (Subject: ${params.subjectSlug})

MANDATE:
1. Direct the Research Sub-Agent to perform multi-perspective research covering: ${params.requiredPerspectives.join(", ")}.
2. Submit the compiled draft using "lms_submit_research_draft".
3. Request peer review from the Validation Sub-Agent using "lms_validate_research_draft".
4. If issues are raised, forward the critique to the Research Sub-Agent. The Research Sub-Agent can either fix the defects or defend its findings with counter-evidence.
5. STRICT ROUND LIMIT: You may conduct up to ${max} rounds of critique/defense.
6. HUMAN ESCALATION BOUNDARY: If consensus is not reached after ${max} rounds (Round ${params.currentRound} of ${max}), you MUST STOP the research process immediately. The server will escalate to the learner for the final decision. Do not attempt further automated rounds.
`.trim();
}

export interface ResearchAgentPromptParams {
  topicTitle: string;
  subjectTitle: string;
  requiredPerspectives: SourcePerspective[];
  priorDefects?: string[];
  currentRound: number;
}

export function renderResearchAgentPrompt(params: ResearchAgentPromptParams): string {
  const isRevision = params.currentRound > 1;
  return `
You are the LMS Research Sub-Agent tasked with compiling a canonical research synthesis on:
"${params.topicTitle}" for "${params.subjectTitle}".

REQUIREMENTS:
1. Multi-Perspective Coverage: Address ${params.requiredPerspectives.join(", ")}. Include theoretical foundations, practical engineering implementation tradeoffs, and known edge-case pitfalls.
2. Citations & Grounding: Every substantive claim must have an inline numeric footnote [1], [2] referencing a reputable primary source (academic papers, official specifications, authoritative documentation).
3. Structured Markdown: Format with clear H1/H2 headings, concise technical prose, and code/architecture snippets where applicable.
${
  isRevision
    ? `
4. DEFENSE & REVISION MANDATE (Round ${params.currentRound}):
Prior critique defects to address:
${(params.priorDefects ?? []).map((d, i) => `  ${i + 1}. ${d}`).join("\n")}

You have agency: If a flagged defect is valid, amend your draft. If a defect is an unfounded critique or misunderstanding, you must provide a rigorous "defenseArgument" citing primary sources rather than blindly overwriting.
`
    : ""
}
`.trim();
}

export interface ValidationAgentPromptParams {
  topicTitle: string;
  draftMarkdown: string;
  citations: string[];
  defenseArgument?: string;
  currentRound: number;
}

export function renderValidationAgentPrompt(params: ValidationAgentPromptParams): string {
  return `
You are the LMS Validation Sub-Agent acting as an adversarial peer reviewer for:
"${params.topicTitle}".

REVIEW CRITERIA:
1. Factual Accuracy: Check for hallucinations, unverified claims, or outdated consensus.
2. Citation Integrity: Verify that claims cited with [n] actually map to reputable sources.
3. Perspective Balance: Ensure the draft addresses theoretical principles, real-world practicalities, and critical drawbacks.
4. Objective Evaluation of Defenses:
${
  params.defenseArgument
    ? `The research agent submitted a defense argument for this round:\n"${params.defenseArgument}"\nEvaluate this defense with an open mind. If the counter-evidence is valid, mark the critique as resolved.`
    : "Review the initial draft rigorously."
}

DECISION:
- If the draft satisfies all criteria: Accept the draft ("decision": "accept").
- If defects remain: List specific, actionable defects ("decision": "raise_issues") with clear guidance on what must be corrected or defended.
`.trim();
}

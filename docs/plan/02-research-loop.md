# Phase 2 — Track 2: Agent Research & 3-Round Peer Review

Depends on: Phases 0, 1. The agents themselves (LLM) are driven externally via MCP prompts/tools; the server's job is **deterministic state enforcement and persistence**. It does not run the LLM loop itself.

## T2.1 State machine — `src/lib/lms/research-machine.ts` (pure)
Port from `submitResearchDraft` / `validateResearchDraft` / `resolveResearchEscalation` in the released skill `workflow.ts` (✅ already implemented there; see plan README Finding 1).
States per source row: `pending → in_review → validated | escalated_to_user | rejected`; round counter 0..3.
- `submitDraft(state, draft)`: requires multi-perspective coverage (≥ theory, practical, critique per design §7.1) and non-empty citations; if `round > 3` throws a typed error. Accepts an optional `defenseArgument` after round 1.
- `validate(state, verdict)`: `accepted` → `validated`; `issues` with round < 3 → increment round, back to `pending`; `issues` at round 3 → `escalated_to_user`.
- `resolveEscalation(state, decision)`: `approve_override | edit_and_approve | reject`. `edit_and_approve` requires the edited markdown.
- Invalid transitions throw `InvalidTransitionError`.
- **Accept:** table-driven tests for every transition plus "cannot exceed 3 rounds" and "cannot submit while escalated".

## T2.2 Persistence service — `src/lib/lms/research.ts`
- `startResearchSession(ownerId, subjectSlug, topic, perspectives[])` creates the `lms_sources` row (`track='agent_research'`).
- `submitResearchDraft`, `validateResearchDraft`, `resolveResearchEscalation` load the row `for update`, apply the machine, append to `debate_history` (`{round, role, kind, content, citations, at}`), and save in a single transaction.
- Draft body is stored in `debate_history`/a `draft_markdown` column until accepted (add column in migration if missing), so no half-reviewed content reaches GitHub or RAG.
- On `validated` (or approved override): write `lms/<slug>/sources/<NN>-<topic>.md`, update `lms/<slug>/sources/metadata.json` with `owner: "agent_research"`, and call `indexSource` (Phase 1). If the GitHub write or indexing fails, keep the status as `validated` and set a retryable `index_error`, with an idempotent `retryIndex`.
- Concurrency: two simultaneous validations must not both advance the round (row lock or compare-and-set on `review_round`).
- **Accept:** PGlite tests: happy path in 1 round; fix in round 2; stall → escalate at round 3 with the full transcript; each of the 3 user decisions; double-submit race.

## T2.3 Citation sanity checks (cheap, deterministic)
Before a draft is accepted for review: every `[n]` reference resolves, URLs are well-formed, and duplicates are flagged. Does **not** fetch URLs in v1.

## T2.4 Prompts content (consumed in Phase 4)
Draft the text for `lms-orchestrate-research`, `lms-research-agent`, `lms-validate-agent` in `src/lib/lms/prompts/*.ts`, as plain template functions with snapshot tests. The prompts must state the 3-round limit, the "defend, don't blindly overwrite" rule, and the stop-and-escalate behaviour.

## Done when
The full lifecycle runs through service functions in tests and the escalated state is queryable (`listEscalations(ownerId)`) for the UI.

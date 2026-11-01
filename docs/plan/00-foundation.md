# Phase 0 — Foundation (schema, types, pure algorithms)

Goal: a tested domain core with no network, UI, or LLM dependency.

## T0.1 Migration `migrations/005_lms_core.sql`
- `create extension if not exists vector;`
- Tables from design §4.2, adding `owner_id text not null default ''` to `lms_learner_profiles` (PK `owner_id`), `lms_subjects`, `lms_spaced_repetition`. Child tables inherit scope via `subject_id`.
- Replace `user_id uuid` FKs: this repo's owner id is `text`, and `users` may not exist in open mode.
- Add the missing table `lms_node_edges (node_id, depends_on_node_id, primary key both)` with a check that they differ.
- Constraints: `unique (owner_id, slug)` on subjects; `check` enums for `status`, `track`, `validation_status`, `quiz_type`, `quiz_purpose`; `review_round between 0 and 3`.
- Indexes: `lms_nodes (subject_id, difficulty_level)`, `lms_spaced_repetition (owner_id, next_review_at)`, `lms_quizzes (node_id, quiz_purpose)`, HNSW on `lms_rag_chunks.embedding vector_cosine_ops`, GIN on `to_tsvector('english', content)` for keyword search.
- Extra columns the design implies but omits: `lms_subjects.difficulty_scale_n int`, `lms_nodes.ordinal int`, `lms_quizzes.placement_session_id`, `lms_sources.content_hash`, `lms_sources.title`.
- **Accept:** `npm run db:migrate` applies cleanly; re-run is a no-op; PGlite test loads it (confirm PGlite's `vector` extension; if unavailable, split vector DDL into `006_lms_vector.sql` and skip it in tests).

## T0.2 Types + zod schemas — `src/lib/lms/types.ts`
Row types, enums as `as const` arrays, and zod schemas for every `prompt_payload`/`user_submission`/`debate_history`/`history` JSONB shape (discriminated union on `quiz_type`). These schemas are reused by MCP tool inputs (Phase 4).

## T0.3 Repository layer — `src/lib/lms/repo.ts`
Thin typed functions over `Db`: `createSubject`, `getSubjectBySlug`, `listSubjects`, `upsertProfile`, node/edge CRUD, quiz CRUD, source CRUD, `sessions`. Every function takes `ownerId` and filters by it. Multi-statement changes use `db.transaction`. Write an `audit` row for mutating operations (reuse `src/lib/audit.ts`).
- **Accept:** PGlite tests (`repo.test.ts`) including cross-owner isolation.

## T0.4 Pure algorithms (each with its own `*.test.ts`)
> **Port from the released skills** ([`workflow.ts`](https://github.com/nnminh-sam/agentic-workflows/blob/main/.agents/skills/lms-teaching-orchestrator/scripts/workflow.ts), already done): copy the logic and its tests from `workflow.test.ts`, but refactor from the in-memory `LmsWorkflowState` object into pure functions over the smaller DB row types. Keep the rules identical.
| File | Content | Key tests |
|---|---|---|
| `placement.ts` | `stepBinarySearchPlacement` per §6.1 | N=1,2,16,32; all-correct → N+1 clamped to N (decide semantics: entry level cannot exceed N); all-wrong → 1; exhaustive over every boundary k for N ≤ 64 resolves to exactly k+1 in ≤ ⌈log2(N+1)⌉ steps |
| `srs.ts` | SM-2 per §6.2: `scheduleReview(state, q, now)` → new `{reps, ef, intervalDays, lapses, nextReviewAt}` | rep1=1d, rep2=3d, rep3=round(3·EF), EF floor 1.3, lapse resets reps and keeps lapses++ |
| `dag.ts` | `detectCycle` (3-colour DFS), `topoOrder`, `unlockedNodes(nodes, edges)`, `validatePath` (monotonic difficulty along edges, orphan nodes, every node has a source, capstone milestone present) | cycles, diamonds, disconnected |
| `chunker.ts` | Split markdown by `#`/`##`/`###`, size cap with overlap, keep heading breadcrumb in metadata | code fences not split, tables kept intact |
| `research-machine.ts` | Pure reducer for research session states (see Phase 2) | placed in Phase 2 |
- **Note:** the design's `entryLevel: Math.min(nextState.entryLevel, state.high + 1)` is subtle. Specify and test it against the exhaustive property above rather than copying it blindly.

## T0.5 Test wiring
Add new test files to the `npm test` script in `package.json` (currently an explicit file list). Consider switching to a glob `src/**/*.test.ts`.

## Done when
`npm run typecheck && npm test` is green; no UI/route changes yet.

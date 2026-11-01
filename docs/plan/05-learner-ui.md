# Phase 5 — Learner UI at `/learning`

Depends on: Phase 3 services (and Phase 4 for the in-page tutor via MCP tools).
Reference: [preview.html](../lms/preview.html). Use it for layout/interaction only. **All content comes from the DB.**

## UI conventions
- Server Components fetch data via services (owner from session); mutations through server actions or `/api/lms/*`. Client components only where interactive (tabs state, quiz, chat, upload).
- Reuse the existing design system in `src/components/ui.tsx` and `globals.css`. The demo's CSS variables (`--accent`, `--ok-soft`, …) should be mapped onto the app's existing tokens, not pasted as a second theme. Dark mode follows the app's current mechanism (the demo's own sidebar and theme toggle are **not** rebuilt; the real `sidebar.tsx` already exists).
- Replace the demo's inline SVGs with `lucide-react`.
- Routing: **URL-driven tabs** instead of `switchTab()` JS, for deep links and the back button:
  `/learning` (redirect → last subject), `/learning/[slug]` (path), `/learning/[slug]/module/[nodeId]`, `/learning/[slug]/quiz/[quizId]`, `/learning/review`, `/learning/[slug]/research`, `/learning/[slug]/sources`.
  Shared layout `learning/[slug]/layout.tsx` renders the header and tabs.
- Every view needs **loading** (`loading.tsx` exists as a pattern), **empty**, and **error** states.

## Tasks

### T5.1 Shell & subject switching
- `components/lms/SubjectHeader.tsx`: subject selector (from `listSubjects`), learner persona badges from `lms_learner_profiles.learning_style` (hidden when empty), placement tier, computed progress chip, retention chip, and buttons "Ingest Notes" and "Continue" (deep-links to the first `in_progress|unlocked` node; disabled if none).
- `LmsTabs.tsx`: five or six tabs with the due-review count badge (hidden at 0).
- **Empty state (no subjects):** onboarding card telling the user to ask the agent "I want to learn …" (link to the Agent tab `/`), with MCP connection instructions. This replaces the stub's empty `div`.

### T5.2 Learning Path view (`tab-dag`)
- `PlacementBanner` appears only when the placement is `completed` and shows the real question count and entry tier; it shows a "Take placement quiz" CTA while status is `placement`.
- `DagTierSection` + `NodeCard`: group nodes by `difficulty_level`; status badges (`mastered_by_placement`, `completed`, `in_progress`/`unlocked`, `locked`); prerequisites from `lms_node_edges`; estimated time from node data (add `est_minutes` column in T0.1 if absent); locked cards are not clickable.
- `CapstoneBanner`: from `capstone_project`, real milestones done/total, links to the `project/README.md` view.
- Consider a true graph (edges drawn) later. v1 = tiered grid as the demo shows. Add an optional `<details>` mermaid/DAG view only if time permits.

### T5.3 Module reader (`tab-reader`)
- Load the node's markdown from GitHub through `getKnowledgeFile`, with caching (`unstable_cache`/revalidate tag by sha). Render with the existing `MarkdownPreview.tsx` (check for GFM tables, code highlighting; the demo's `.code-keyword` spans are hand-made, not a requirement).
- Header metadata from the node row. "Start Mastery Gate" is disabled with a reason when the node is not unlocked or has no quiz yet (agent must generate it).
- Handle a missing/404 file (node drafted but guide not written) gracefully.

### T5.4 Tutor sidekick
- Reuse `components/chat/AgentChat.tsx`/`/api/chat` scoped with a context preamble (subject + node) rather than building a second chat stack. The tools it calls are the LMS tools (Phase 6 wires them into `agent-tools.ts`). Show tool calls with the existing `ToolCallCard`. **Remove** the demo's `sendMockMessage`.
- Persist as a normal chat session tagged with `subject_slug/node_id` (needs a small `chat_sessions` metadata addition or title convention. Decide.)

### T5.5 Quiz runner (`tab-quiz`)
Polymorphic by `quiz_type`:
- `mcq_4`: radio options A–D (accessible, keyboard operable; the demo uses clickable divs, so use `<input type=radio>`); submit → server grades; feedback + explanation shown **after** the server response.
- `open_ended`: textarea + rubric hint, async grading state.
- `code_challenge`: starter code in a textarea/monospace editor (CodeMirror optional later), shows the constraints.
- `project_task`: checklist + optional commit/PR URL field.
- Result panel: score, pass/fail, agent feedback, next-node unlock message (computed from the response), retry button. Also used by placement (`purpose=placement`, no "node" framing, progress "question k of ≤ ⌈log2 N⌉") and review quizzes.
- Prevent double-submit; handle a network error with a retry that is safe due to idempotency in T3.5.

### T5.6 Daily Review (`tab-srs`)
- Table from `dueReviews` + upcoming: node, last reviewed, interval, EF/stability, due badge, "Start Quiz" → quiz runner (generating a variation may need the agent; show "Waiting for the agent to prepare a quiz" with a copyable prompt/deep link into the Agent tab if none exists).
- Retention curve: **omit the placeholder.** Either implement a small chart from real review history (needs a `lms_review_log` table, so add in T0.1 if wanted) or ship without it for v1. Recommend a log table plus a simple SVG sparkline in a follow-up.

### T5.7 Research & Debate view (`tab-research`)
- List research sources with a status badge (`pending | in_review | validated | escalated_to_user | rejected`) and round `n/3`.
- Detail: transcript rendered from `debate_history` (roles → colours as the demo), committed GitHub path and index status.
- **Escalation panel** (only for `escalated_to_user`): disputed claims, critique vs. defence, actions *Override & accept*, *Edit & approve* (markdown editor), *Reject*, calling the server action that records the human decision (this is where the T4.3 confirmation is issued). Also show an escalation badge/count on the tab.

### T5.8 BYOS Knowledge Hub (`tab-ingest`)
- Dropzone (`react-dropzone` not required; native drag events) → `POST /api/lms/sources`; per-file progress and error states; accepted types shown from the same constant used by the server parser dispatch.
- Table from `lms_sources` where `track='byos'`: original filename, type, GitHub path (`lms/<slug>/sources/<filename>`, pointing to the stored original file), chunk count (count query), status (`Ready | Processing | Failed` with retry). Remove action.
- Honest size limit text from config (see T1.1/T1.6), not "50MB" unless supported.

### T5.9 Accessibility, responsive, polish
Keyboard navigation for tabs (ARIA tablist semantics even with links), the demo's two-pane reader collapses to stacked on mobile (the repo has recent mobile viewport fixes, so follow them), focus rings, reduced motion.

## Tests
- Component/unit tests for the quiz runner state logic and node grouping (vitest is installed but `npm test` uses node:test; follow whichever the nearest existing tests use).
- Manual verification script in the PR: empty account → create subject via MCP → each view populated → mock data never appears (`grep -ri "raft" src/components/lms src/app` should return nothing).

## Done when
A learner can complete the entire flow in the browser, and a brand-new account shows sensible empty states in every view.

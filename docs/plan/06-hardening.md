# Phase 6 — Agent Integration, Hardening & Rollout

## T6.1 Built-in Kaneki agent wiring
- Preferred: connect `/api/chat` to the new MCP server through the existing `@ai-sdk/mcp` client pattern in `src/lib/mcp.ts` (add `getLmsMcpTools()`; same safe fallback to `{}` on failure). Alternative with less network hop: register the LMS service functions directly in `createAgentTools(ownerId)` (`src/lib/agent-tools.ts`) by sharing the zod schemas. Pick one to avoid two divergent tool sets.
- Add LMS system-prompt guidance (tutor behaviour, "never reveal quiz answers before submission", "lecture in module files, not in chat" from design §7.2).
- The 6 `lms-*` skills are ✅ already released externally. Decide whether to reference them from the agent prompt or install them for the built-in agent; no new skill authoring is planned.

## T6.2 Security review
- Every route, action, resource, and tool derives `ownerId` from auth; add a test matrix of cross-owner access across all entry points.
- Upload safety: size/type limits, zip-bomb/XLSX row caps, no HTML passthrough into the markdown renderer (check `react-markdown` is not using `rehype-raw`).
- Rate limiting and cost control for embedding/LLM-judge calls (per-owner daily cap, via the existing audit table or a counter).
- MCP key rotation and scope documentation; log auth failures (via `audit.ts`) without leaking tokens.
- Prompt-injection note: ingested documents and web research are untrusted. Tool outputs fed to agents are labelled as data, and no tool performs privileged actions (escalation resolution, deletion) based on retrieved text alone.

## T6.3 Observability
- Token/cost telemetry (design §7.4): `lms_usage_log` table (skill/tool, node, subject, tokens, model, duration) written by the judge/embedding calls, plus a simple per-subject report. Optional for v1; minimal version = structured `console.log` JSON.
- Error reporting for the GitHub/embedding failures with retry actions visible in the UI.

## T6.4 Performance
- Check the N+1 queries in the overview/graph (single query for nodes plus one for edges).
- HNSW index recall/latency sanity check with ~10k chunks; tune `ef_search`.
- Cache GitHub reads; confirm no function exceeds Vercel's timeout during ingestion (chunk embedding batches; allow resumable `processing` status).

## T6.5 End-to-end test
Scripted run against a preview deployment/local with a fake embedder and judge: all MCP tools in order and a Playwright pass (if adopted) through the UI views. At minimum, a documented manual checklist.

## T6.6 Docs
- Update `docs/lms/README.md` §8 roadmap statuses. Phase 1 stays ✅ Done, but fix its deliverable paths to point at the external skills repo (the files aren't in this repo).
- `docs/lms/SETUP.md`: env vars, running migrations (`npm run db:migrate`), enabling `pgvector` on Neon, connecting Claude/Cursor to `/api/mcp`.
- Update the root `README.md` feature list.

## T6.7 Rollout
1. Merge Phases 0–1 (no user-visible change besides a migration). Run the migration on Neon before deploying.
2. Ship MCP (Phase 4) behind the `KANEKI_MCP_API_KEY` being set, so it is off by default.
3. Ship the UI (Phase 5) incrementally: path and reader first, then quiz/review, then research/BYOS.
4. Dogfood with one real subject; collect defects; then close out.

## Risks

| Risk | Mitigation |
|---|---|
| PGlite lacks `pgvector` | Split the vector DDL; use a fake store for unit tests and real Neon for a smoke script (`scripts/db-smoke.mjs` pattern). |
| Vercel request body/time limits for uploads and embeddings | Direct upload, batch, resumable status |
| LLM-judge inconsistency | Rubric prompts, temperature 0, threshold config, allow a user "dispute" action (post v1) |
| Agent self-approves human escalations | Confirmation token issued by the UI only (T4.3) |
| Quiz answers leaked to client | Keys stripped server-side; tested |
| Scope creep (FSRS, code sandbox, DAG graph viz) | Explicitly deferred; interfaces leave room |

## Definition of done (whole feature)
`npm run typecheck`, `npm run lint`, `npm test` green; migrations applied on Neon; an external MCP client and the in-app agent both complete the lifecycle; UI shows no mock data and handles empty/error states; docs updated.

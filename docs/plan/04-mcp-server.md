# Phase 4 — Remote MCP Server (`/api/mcp`)

Depends on: Phases 1–3 (services). The MCP layer is a thin adapter: validate input (zod) → call service → shape output. No business logic in handlers.

## T4.1 Choose the server implementation
Spike (≤ half a day): `mcp-handler` (Vercel's adapter) vs the official `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport` in **stateless** mode (`sessionIdGenerator: undefined`), on Next.js 16 route handlers. Pick the one that works on Vercel Fluid functions without in-memory sessions. Record the decision in the PR.

## T4.2 Route & auth — `src/app/api/mcp/route.ts`
- `POST` (JSON-RPC, optional SSE), `GET`/`DELETE` returning 405 in stateless mode.
- Auth: reuse `src/lib/auth` (`bearerToken`, JWT) and add `KANEKI_MCP_API_KEY` bearer (constant-time compare). Resolve to `ownerId`. Confirm `src/proxy.ts` matcher lets `/api/mcp` through to this check without a cookie redirect (it returns 401 JSON for `/api/*`, which is correct).
- `export const maxDuration` appropriate for ingestion/embedding tools; `runtime = 'nodejs'`.
- Reject requests with an invalid `Origin` for browser callers (DNS-rebinding guard per MCP spec).

## T4.3 Tools — `src/lib/lms/mcp-server.ts`
Register all tools from design §5.2 with zod `inputSchema` and descriptions written for LLM consumption.
| Group | Tools |
|---|---|
| A | `lms_get_or_update_learner_profile`, `lms_create_subject` |
| B | `lms_ingest_user_file`, `lms_start_research_session`, `lms_submit_research_draft`, `lms_validate_research_draft`, `lms_resolve_research_escalation`, `lms_search_rag` |
| C | `lms_placement_start`, `lms_placement_submit_step` |
| D | `lms_draft_learning_path`, `lms_get_next_nodes` |
| E | `lms_generate_quiz`, `lms_submit_quiz` |
- **File ingestion over MCP:** an agent cannot send a local file path to a remote server. Accept `content_base64` (small) or a `url`/blob reference. Document the size limit; large files go through the UI upload.
- **`lms_resolve_research_escalation` is a human decision.** Gate it: require a `confirmation_token` that the UI issues, or accept it only from an authenticated UI session, so an agent cannot self-approve. Same for the path escalation. (Design is silent; propose and confirm with the user.)
- Never return the MCQ answer key in `lms_get_next_nodes` / `lms_generate_quiz` responses to the *learner-facing* flow. The authoring agent supplies the key, and responses echo only the stem and options.
- Errors: map typed service errors to MCP `isError` results with actionable text (e.g. "Round limit reached: escalated to user").

## T4.4 Resources
`lms://profile`, `lms://subjects/{slug}/overview`, `.../graph`, `.../nodes/{nodeId}`, `lms://reviews/due` (templates registered with `list` support for subjects).

## T4.5 Prompts
Register the 6 prompts (`lms-orchestrate-research`, `lms-research-agent`, `lms-validate-agent`, `lms-conduct-placement`, `lms-tutor-node`, `lms-daily-review`) using the content from T2.4 (+ new text for the other 3).

## T4.6 Tests
- `mcp.server.test.ts`: in-process client ↔ server using the SDK's in-memory/HTTP transport. List tools/resources/prompts, call a tool per group, unauthenticated → 401, wrong owner → not found.
- Contract snapshot of tool names/schemas so accidental breaking changes are visible.
- Manual: connect from Claude Desktop/Cursor with the bearer key; document the config in README.

## T4.7 Env & config
Add `KANEKI_MCP_API_KEY`, `LMS_EMBEDDING_*` to `.env.example` (create if absent) and Vercel docs.

## Done when
An external MCP client can run create_subject → ingest → research → placement → draft path → gate quiz → review end-to-end against a dev deployment.

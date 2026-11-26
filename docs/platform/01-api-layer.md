# Phase 1 — Shared API layer (Hono + OpenAPI)

Goal: every feature the web app can do is reachable over a typed, versioned HTTP API that any client can call with a Bearer token.

## T1.1 Fix owner resolution (do first, small)
- `currentOwnerId()` (`apps/web/src/lib/owner.ts`) reads only the session cookie. Change it to check, in order: `Authorization: Bearer` (session JWT **or** `knk_` API key) → session cookie.
- Share one resolver `resolveOwner({ authorization, cookie })` in `packages/core`; `currentOwnerId()`, `src/proxy.ts` and the Hono middleware all call it.
- **Accept:** test calling an existing route (e.g. `/api/chat/sessions`) with only a Bearer header returns 200; cookie-only still works; open/locked modes unchanged.

## T1.2 Hono app in `packages/api`
- `createApi()` returns an `OpenAPIHono` app with base path `/api/v1`.
- Middleware, in order: request id → CORS (origins from env, see Phase 2) → auth (`resolveOwner`, sets `c.var.ownerId`) → rate limit (per owner, in-memory for now) → error handler that returns `{ error: { code, message } }` with consistent status codes.
- Route groups are mounted from modules: `app.route("/tasks", tasksRoutes)`, etc.
- Mount in Next: `apps/web/src/app/api/v1/[[...route]]/route.ts` exporting `GET/POST/PATCH/PUT/DELETE = handle(app)` from `hono/vercel`. Set `runtime = "nodejs"`.
- **Accept:** `GET /api/v1/health` returns `{ ok: true, version }`; unauthenticated `GET /api/v1/me` returns 401 JSON.

## T1.3 OpenAPI document
- Every route is declared with `createRoute({ request, responses })` using zod schemas from the module.
- `GET /api/v1/openapi.json` serves the spec; `GET /api/v1/docs` serves a reference UI (Scalar or Swagger UI), dev only.
- Security scheme: `bearerAuth` (JWT or `knk_` key).
- **Accept:** spec validates (`@redocly/cli lint`), and lists every route below.

## T1.4 Endpoints (port existing behaviour)
Map current Server Actions and route handlers to versioned endpoints. Each handler is a one-line call into a service.

| Area | From | To |
|---|---|---|
| Me / settings | `/api/auth/me`, `actions/settings.ts` | `GET /me`, `GET/PATCH /settings`, `GET/POST/DELETE /api-keys`, `GET/PUT /ai/config` |
| Todos | `lib/todos.ts` (RSC + agent) | `GET/POST /tasks`, `PATCH /tasks/:id` |
| Chat sessions | `/api/chat/sessions/**` | `GET/POST /chat/sessions`, `GET/PATCH/DELETE /chat/sessions/:id`, `GET /chat/sessions/:id/messages?cursor=` |
| Learning | `actions/lms.ts`, `/api/lms/sources` | `/learning/subjects/**`, `/learning/quizzes/:id/submit`, `/learning/placement`, `/learning/sources`, `/learning/reviews/due` |
| Notes | `actions/github.ts`, `/api/notes/sync-status` | `/notes/tree`, `GET/PUT/DELETE /notes/file?path=`, `/notes/rename`, `/notes/copy`, `/notes/sync-status` |
| Audit / usage | `/api/audit`, `/api/ollama/usage`, `/api/openrouter/usage` | `/audit`, `/usage/ollama`, `/usage/openrouter` |
| Deployments | `actions/vercel.ts`, `/api/vercel/**` | `/deployments/**` |

- Server Actions stay, but are rewritten to call the same service functions (not the HTTP API) so web keeps its speed.
- Old `/api/*` routes stay until all clients use `/api/v1`; mark them deprecated in code comments.
- **Accept:** integration tests per group using `app.request()` against PGlite: happy path, 401, 404, validation 400, cross-owner isolation.

## T1.5 Generated client — `packages/api-client`
- `openapi-typescript` generates `schema.d.ts` from the spec (script `pnpm gen:api`, run in CI and checked for drift).
- `createKanekiClient({ baseUrl, getToken, onUnauthorized })` wraps `openapi-fetch`, adds the Bearer header, and retries once after refresh (Phase 2).
- Export `createChatTransport({ baseUrl, getToken, fetch })` for `useChat` (Phase 4) so each client passes its own `fetch` (`expo/fetch` on mobile).
- **Accept:** a typed call `client.GET("/tasks")` compiles in web, desktop and mobile packages; changing a zod schema without regenerating fails CI.

## Done when
All web features are available under `/api/v1` with an OpenAPI spec, a generated TS client exists, and Bearer-only requests work on every route.

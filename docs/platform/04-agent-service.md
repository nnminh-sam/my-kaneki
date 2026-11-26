# Phase 4 — Agent service for all clients

Goal: one server-side assistant at `/api/v1/chat` that every client streams from, using the user's chosen cloud model, with device tools and approvals.

## T4.1 Move the agent into `packages/agent`
- Move provider resolution (`src/lib/ai/providers.ts`, `resolveChatLanguageModel`) and the chat handler body from `src/app/api/chat/route.ts` into `packages/agent`.
- `handleChat({ ownerId, client, capabilities, body })` returns the AI SDK UI message stream `Response` (`toUIMessageStreamResponse()`), which Hono returns as is.
- Keep: usage recording (`recordUsage`), generation audit, provider error formatting, message persistence (`updateSessionMessages`), session pagination.
- Raise `maxDuration` to **300** (Hobby max). Keep a step cap (`stopWhen` step count) so a turn can't loop.
- `/api/chat` becomes a thin alias to the same handler until web moves to `/api/v1/chat`.
- **Accept:** web chat works through `/api/v1/chat` with identical behaviour; existing chat tests pass.

## T4.2 Request contract
```ts
POST /api/v1/chat
{
  sessionId: string,
  messages: UIMessage[],            // or only the last message + server-side history (see T4.5)
  provider?: "ollama" | "openrouter", model?: string,
  client: "web" | "desktop" | "mobile",
  capabilities: string[],           // e.g. ["device.calendar","device.notifications","device.health"]
  context?: { timezone: string, locale: string, location?: { lat, lon } }
}
```
- `timezone` matters for every time-management tool; never guess it on the server.

## T4.3 System prompt composition
- Base persona + current date/time in the user's timezone + one `prompt.ts` snippet per enabled module + user preferences from settings.
- Modules can be turned off per user in settings; their tools and prompt then disappear.
- Keep it short: snippets describe *when* to use tools; tool descriptions carry the details.

## T4.4 Client-side (device) tools
- Tools with `kind: "client"` are sent to the model without `execute`. The client handles the tool call with `useChat`'s tool-call callback, runs it locally, and sends the result back; the stream continues.
- First client tools: `device_calendar_events` (mobile/desktop), `device_schedule_notification`, `device_health_summary` (mobile, later), `device_clipboard_read` (desktop, `needsApproval`).
- A shared `packages/ui` hook `useDeviceTools(handlers)` maps tool names to platform handlers.

## T4.5 Approvals (human in the loop)
- Tools with `needsApproval` (money writes, deletes, sending anything external, redeploys) pause for the user. The client shows an approve/deny card (extend `ToolCallCard`) and the decision is sent back in the next request.
- Denied calls return a structured result so the model can explain or offer alternatives.

## T4.6 Model selection and limits
- Per-user default provider/model in settings (exists today via `/ai-provider`); per-request override.
- Fallback chain on 429/5xx (e.g. OpenRouter free model → Ollama cloud), logged in audit.
- Show remaining quota in the client (`/usage/*` endpoints from Phase 1). Remember: OpenRouter free = 50 req/day without $10 credits.

## T4.7 Streaming on each client
- **Web/desktop:** `useChat({ transport: createChatTransport({ baseUrl, getToken }) })`.
- **Mobile:** same, passing `fetch: expoFetch` from `expo/fetch` (required for streaming on React Native; Expo SDK 52+).
- **Accept:** the same conversation can be continued from web, desktop and mobile; tool cards render the same everywhere.

## Done when
All three clients (or a test harness for the native ones) chat through `/api/v1/chat`, server tools run, a client tool round-trips, and an approval-gated tool waits for the user.

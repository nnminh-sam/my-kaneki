# Feature flags: use cases

- An owner turns the Learning area off in Settings. The Learning sidebar item disappears, `/learning` pages return 404, LMS actions and `/api/lms/sources` refuse, MCP LMS calls return 403, and chat stops offering LMS tools.
- An operator sets `KANEKI_DISABLED_FEATURES=lms` to switch Learning off for every owner, regardless of stored rows. The Settings toggle is shown disabled.
- A database where the flag migration has not run keeps the registry defaults, so Learning stays on.

## Where the flags live

- Registry: `src/lib/features/registry.ts` (the list of features, their stage and default).
- Status API: `GET /api/features` returns the effective flags for the signed-in owner.
- Environment override: `KANEKI_DISABLED_FEATURES`.

## LMS gate list

Each gate reads the effective flag on every request, through `isFeatureEnabled(owner, "lms")` (the sidebar uses `getEffectiveFlags(owner)`), and refuses as listed below when the flag is off. `src/lib/agent-tools.ts`, `src/lib/chat-system-prompt.ts` and `src/lib/navigation.ts` do not read the flag; they receive the value from their caller.

- Learning pages: `src/app/(workspace)/learning/` (layout, `[slug]` layout, and every `page.tsx`), answered with 404.
- LMS server actions: `src/actions/lms.ts`, answered with `{ ok: false, error }`.
- `/api/lms/sources`: `src/app/api/lms/sources/route.ts`, answered with 403 `feature_disabled`.
- `/api/mcp`: `src/app/api/mcp/route.ts`, answered with 403 after authentication.
- Chat tools and prompt: `src/app/api/chat/route.ts`, `src/lib/agent-tools.ts`, `src/lib/chat-system-prompt.ts`.
- Sidebar: `src/app/(workspace)/layout.tsx` and `src/lib/navigation.ts` (the Learning item is hidden).

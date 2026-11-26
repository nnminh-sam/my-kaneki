# Feature flags: system design

- Registry: `src/lib/features/registry.ts` lists every toggleable feature with its stage and default. Only `lms` (released, default on) exists today.
- Storage: table `feature_flags` (migration `migrations/012_feature_flags.sql`), one row per (owner, feature). No row means the registry default.
- Precedence: environment force-off (`KANEKI_DISABLED_FEATURES`, comma-separated, read per request) beats the stored row, which beats the default.
- Fail-open: a failed flag read uses registry defaults and never fails a request.
- Read path: `getEffectiveFlags` in `src/lib/features/flags.ts`; `isFeatureEnabled` wraps it for one feature. The sidebar layout, the Settings page and `GET /api/features` call `getEffectiveFlags`; every other gate calls `isFeatureEnabled`. Nothing reads the table directly.
- Write path: `setFeatureAction` in `src/actions/features.ts` writes the flag and a `feature.toggle` audit row in one transaction.
- API: `GET /api/features` returns the effective flags for the signed-in owner.
- LMS gates (each reads the flag through `isFeatureEnabled(owner, "lms")` unless noted): learning pages under `src/app/(workspace)/learning/` (404), LMS server actions in `src/actions/lms.ts`, `src/app/api/lms/sources/route.ts` (403), `src/app/api/mcp/route.ts` (403), chat tools and prompt (the chat route `src/app/api/chat/route.ts` reads the flag and passes lms to `src/lib/agent-tools.ts` and `src/lib/chat-system-prompt.ts`), and the sidebar (`src/app/(workspace)/layout.tsx` reads `getEffectiveFlags` and passes the ids from `hiddenNavItemIds` in `src/lib/navigation.ts`).

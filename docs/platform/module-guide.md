# Module guide: feature flags

- Registry (add a feature here): `src/lib/features/registry.ts`
- Flag service: `src/lib/features/flags.ts`, barrel `src/lib/features/index.ts`
- Toggle action: `src/actions/features.ts`; Settings page `src/app/(workspace)/settings/page.tsx`; UI `src/components/settings/FeaturesSettings.tsx`
- Status API: `src/app/api/features/route.ts`
- Gate call sites for `lms`: sidebar layout, `/learning` layouts and pages, `src/actions/lms.ts`, `src/app/api/lms/sources/route.ts`, `src/app/api/mcp/route.ts`, `src/app/api/chat/route.ts`
- Environment override: `KANEKI_DISABLED_FEATURES` (see `.env.example`)

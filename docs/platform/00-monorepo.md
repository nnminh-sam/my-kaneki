# Phase 0 — Monorepo

Goal: the same web app, now living in `apps/web`, with shared code pulled into packages. No behaviour change.

## T0.1 Workspace scaffolding
- Add `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `packages/modules/*`), root `package.json` with `turbo` scripts (`dev`, `build`, `lint`, `typecheck`, `test`), `turbo.json` pipelines.
- Replace `package-lock.json` with `pnpm-lock.yaml`.
- Shared `tsconfig.base.json` (strict, `moduleResolution: bundler`, path aliases per package).
- **Accept:** `pnpm install && pnpm typecheck` succeed at the root.

## T0.2 Move the app to `apps/web`
- `git mv` `src/`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`, `vercel.json` into `apps/web/`. Keep `migrations/`, `scripts/`, `docs/`, `demo/`, `skills/` at the root.
- Keep the `@/` alias inside `apps/web` so existing imports don't change.
- Update `scripts/db-migrate.ts` and `scripts/db-smoke.mjs` paths; keep `pnpm db:migrate` at the root.
- Vercel project: set **Root Directory = `apps/web`**, keep env vars. Turn on "Include files outside root directory" so workspace packages build.
- **Accept:** preview deployment works the same as production (login, chat, LMS, notes, todos, settings, audit, deployments).

## T0.3 Extract `packages/core`
- Move `src/lib/db.ts` (`Db`, `getDb`, `getUnpooledDb`, `setDbForTests`), `src/lib/migrate.ts`, and the pure parts of `src/lib/auth/` (`jwt.ts`, `password.ts`, `api-keys.ts` hashing) into `packages/core`.
- `apps/web/src/lib/db.ts` re-exports from `@kaneki/core` for a smooth transition.
- No Next.js imports (`next/headers`, `next/server`) are allowed in `packages/*`. Enforce with an ESLint `no-restricted-imports` rule.
- **Accept:** existing tests pass from their new locations; `packages/core` builds without Next.js installed.

## T0.4 Tests in the monorepo
- Each package keeps `node --import tsx --test "src/**/*.test.ts"`; Turborepo runs them all.
- PGlite stays a dev dependency where tests need it.
- **Accept:** `pnpm test` runs every existing test file; count matches before the move.

## T0.5 Package skeletons
Create empty, building packages so later phases only add code: `packages/api`, `packages/api-client`, `packages/agent`, `packages/tools`, `packages/ui`, `packages/modules/tasks`.

## Done when
Production on Vercel is served from `apps/web`, `pnpm typecheck && pnpm test && pnpm build` are green at the root, and no user-visible change happened.

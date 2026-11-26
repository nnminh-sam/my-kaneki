# How to add a feature module

Every new capability (time management, finance, health, work, …) is added as a module. Follow this checklist; when done, the feature is available in the API, to the assistant on every client, and to external MCP clients.

## 1. Decide the scope
- One sentence: what the module is for and what the assistant should be able to do with it.
- List the tools the assistant needs (verbs), and which ones change data (→ `needsApproval`?).
- Server data or device data? Device data (calendar, health, location) → client tools with a `capability`.

## 2. Create the package
```
packages/modules/<name>/
  schema.ts   zod schemas + types
  service.ts  (ownerId, …) functions; only place with SQL; writes audit rows
  routes.ts   Hono routes with createRoute() + schema.ts
  tools.ts    defineTools([...]) → calls service.ts
  prompt.ts   2–5 lines: when the assistant should use this module
  jobs.ts     optional: job kinds for scheduled work
  index.ts    export const module = { id, routes, tools, prompt, jobs }
```

## 3. Database
- `migrations/NNN_<name>_*.sql`; every table has `owner_id text not null default ''`, timestamps, and indexes for its list queries.
- Money: store integer minor units (`amount_minor bigint`) + `currency text`; never floats.
- Times: `timestamptz` in UTC; take the user's timezone from the request context.

## 4. Register
- Add the module to the registry list in `packages/api` (routes) and `packages/agent` (tools/prompt).
- Add a per-user enable flag in settings if the module is optional.

## 5. Tests (PGlite)
- Service: happy path, validation, cross-owner isolation.
- Routes: 200/400/401/404 via `app.request()`.
- Tools: input schema matches the service; approval flag set on writes that matter.

## 6. UI
- Web page under `apps/web/src/app/(workspace)/<name>` using services in RSC or the API client.
- Mobile/desktop: only if the feature is used there without chat; otherwise the assistant + generic tool cards are enough to start.
- Regenerate the API client: `pnpm gen:api`.

## Example: finance (sketch)
- Tables: `fin_accounts`, `fin_transactions (amount_minor, currency, category, occurred_at, note)`, `fin_budgets`.
- Tools: `finance_add_expense` (`needsApproval` when amount > threshold), `finance_list_transactions` (`readOnly`), `finance_month_summary` (`readOnly`), `finance_set_budget` (`needsApproval`).
- Job: `budget_check` weekly → push when a category passes 80 %.
- Alternative: keep the existing my_finance app and connect it as a remote MCP tool source (`fin_*` prefix) until it is migrated.

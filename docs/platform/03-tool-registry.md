# Phase 3 — Modules and the tool registry

Goal: each feature is a module, and each agent tool is defined **once** and exposed to the in-app agent, the MCP server, and (optionally) REST.

## Problem today
- AI SDK tools: `src/lib/agent-tools.ts` (`addTodo`, `updateNote`, `getVercelDeployments`) + `src/lib/lms/lms-agent-tools.ts` (12 `lms*` tools).
- MCP tools: `src/lib/lms/mcp-server.ts` (14 `lms_*` tools) — separate code, different names, inputs and coverage (e.g. MCP has research tools, the agent doesn't; the agent has todos/notes, MCP doesn't).

## T3.1 `defineTools` — `packages/tools`
```ts
export interface ToolDef<I extends z.ZodType, O> {
  name: string;                 // snake_case, globally unique: "tasks_add"
  title: string;                // human label for UI cards
  description: string;          // written for the model
  input: I;
  output?: z.ZodType<O>;
  kind: "server" | "client";    // client = executed on the device (Phase 4)
  capability?: string;          // required client capability, e.g. "device.calendar"
  needsApproval?: boolean | ((input: z.infer<I>) => boolean);
  readOnly?: boolean;           // → MCP readOnlyHint, safe for background jobs
  run?: (ctx: ToolContext, input: z.infer<I>) => Promise<O>;   // server tools only
}
export interface ToolContext { ownerId: string; client: "web"|"desktop"|"mobile"|"mcp"|"job"; sessionId?: string; now: Date; }
```
- `run` returns data or throws `ToolError(code, message)`; adapters convert errors to `{ success: false, error }` so the model can recover (current behaviour).
- Every `run` is wrapped with the existing session audit (`wrapToolsWithSessionAudit`) and owner scoping.

## T3.2 Registry and adapters
- `createRegistry([tasksModule, learningModule, notesModule, ...])` validates unique names and collects tools, prompt snippets and routes.
- `toAiSdkTools(registry, ctx, { capabilities })` → `Record<string, Tool>` for `streamText`. Client tools are emitted without `execute`; tools whose `capability` the client lacks are left out.
- `registerMcpTools(server, registry, ctx)` → MCP tools with JSON Schema from zod and `readOnlyHint`/`destructiveHint` from metadata. Client tools are never exposed over MCP.
- Optional `toRestRoutes(registry)` for tools that have no hand-written endpoint.
- **Accept:** snapshot test of the generated tool list for each surface; a tool added to a module appears in both agent and MCP with no other code change.

## T3.3 Module shape — `packages/modules/<name>`
```
schema.ts      zod schemas + row types
service.ts     functions (ownerId, …) over Db — the only place with SQL
routes.ts      Hono route group using schema.ts
tools.ts       defineTools([...]) calling service.ts
prompt.ts      short system-prompt snippet: what the module is for, when to use its tools
index.ts       export const module = { id, routes, tools, prompt }
```
Migrations stay in the root `migrations/` folder, named `NNN_<module>_*.sql`.

## T3.4 Migrate existing features
| Module | Source | Tools (new names) |
|---|---|---|
| `tasks` | `src/lib/todos.ts` | `tasks_add`, `tasks_list`, `tasks_complete` |
| `notes` | `src/actions/github.ts` | `notes_read`, `notes_write`, `notes_tree` |
| `learning` | `src/lib/lms/*`, both tool files | union of current agent + MCP tools, one definition each |
| `deployments` | `src/lib/vercel.ts` | `deployments_list`, `deployments_redeploy` (`needsApproval`) |

- Keep old tool names as aliases for one release so saved chat histories with old tool parts still render in `ToolCallCard`.
- `/api/mcp` switches to `registerMcpTools`; external clients see the full set.
- **Accept:** existing LMS/MCP tests pass against the registry; old `agent-tools.ts`, `lms-agent-tools.ts` and the tool parts of `mcp-server.ts` are deleted.

## T3.5 External tools
Keep `getPmAgentMcpTools()` (my_pm_agent) as a registry **source** of remote MCP tools, merged at request time with a name prefix (`pm_*`), so remote and local tools look the same to the agent.

## Done when
One registry drives both the chat agent and `/api/mcp`, every existing tool is migrated, and adding a tool means editing one module file.

import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, type Row } from "./db";
import { listChatSessions } from "./chat-db";
import type { ChatSession } from "./chat-sessions";
import { AI_PROVIDER_CATALOG, getUserAiConfig, normalizeProviderBaseUrl } from "./ai/providers";

export type AuditActor = "user" | "ai-agent";

export type SessionAuditCategory =
  | "workspace_tool"
  | "lms_tool"
  | "mcp_api"
  | "llm_step"
  | "entity_mutation";

export interface AuditContext {
  ownerId?: string;
  sessionId?: string;
  toolCallId?: string;
  toolName?: string;
}

const auditContextStorage = new AsyncLocalStorage<AuditContext>();

/** Runs a callback within an async audit context so downstream mutations link to the active session. */
export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  const parent = auditContextStorage.getStore();
  return auditContextStorage.run({ ...parent, ...ctx }, fn);
}

/** Retrieves the active async audit context, if any. */
export function getAuditContext(): AuditContext | undefined {
  return auditContextStorage.getStore();
}

export interface AuditEntry {
  action: string;
  entityType: string;
  /** Todo id, GitHub file path, session id, or any other identifier. Stored as text. */
  entityId: string;
  actor: AuditActor;
  payload: Record<string, unknown>;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Truncates overly large strings inside audit payloads to keep DB rows fast and inspectable. */
function sanitizePayloadValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[Max Depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}… [truncated ${value.length - 4000} chars]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePayloadValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizePayloadValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Rough token estimator (~4 chars per token) when streaming providers omit usage metadata. */
export function estimateTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/** Appends one audit row (standalone; use only after the primary action already succeeded). */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const ctx = getAuditContext();
  const enrichedPayload: Record<string, unknown> = {
    ...(ctx?.ownerId && entry.payload.ownerId === undefined && entry.payload.owner_id === undefined
      ? { ownerId: ctx.ownerId }
      : {}),
    ...(ctx?.sessionId && entry.payload.sessionId === undefined ? { sessionId: ctx.sessionId } : {}),
    ...(ctx?.toolCallId && entry.payload.toolCallId === undefined ? { toolCallId: ctx.toolCallId } : {}),
    ...(ctx?.toolName && entry.payload.toolName === undefined ? { toolName: ctx.toolName } : {}),
    ...entry.payload,
  };

  await getDb().query(
    "insert into audit_log (action, entity_type, entity_id, actor, payload) values ($1, $2, $3, $4, $5::jsonb)",
    [entry.action, entry.entityType, entry.entityId, entry.actor, JSON.stringify(enrichedPayload)],
  );
}

/** History for one entity, newest first. Served by audit_log_entity_idx. */
export async function listAudit(entityType: string, entityId: string, limit = 50): Promise<AuditLogRow[]> {
  const rows: Row[] = await getDb().query(
    `select id, action, entity_type, entity_id, actor, payload, created_at from audit_log
     where entity_type = $1 and entity_id = $2 order by created_at desc, id desc limit $3`,
    [entityType, entityId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actor: r.actor as AuditActor,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export function classifyToolCategory(
  toolName: string,
  isMcp = false,
): "workspace_tool" | "lms_tool" | "mcp_api" {
  if (isMcp) return "mcp_api";
  if (toolName.startsWith("lms") || toolName.startsWith("kaneki_lms")) return "lms_tool";
  return "workspace_tool";
}

function extractResultError(result: unknown): { isError: boolean; errorMessage: string | null } {
  if (!result || typeof result !== "object") {
    return { isError: false, errorMessage: null };
  }
  const obj = result as Record<string, unknown>;
  if (obj.success === false) {
    return {
      isError: true,
      errorMessage: typeof obj.error === "string" ? obj.error : "Tool returned success: false",
    };
  }
  if (obj.isError === true) {
    if (Array.isArray(obj.content)) {
      const text = obj.content
        .map((c: unknown) =>
          c && typeof c === "object" && "text" in (c as Record<string, unknown>)
            ? String((c as Record<string, unknown>).text)
            : JSON.stringify(c),
        )
        .join("\n");
      return { isError: true, errorMessage: text || "MCP tool returned error" };
    }
    return {
      isError: true,
      errorMessage: typeof obj.error === "string" ? obj.error : "MCP tool execution failed",
    };
  }
  return { isError: false, errorMessage: null };
}

/**
 * Wraps AI SDK tool definitions so every tool / MCP API invocation in a chat session
 * is automatically timed, linked via AsyncLocalStorage to downstream DB/GitHub writes,
 * and recorded to `audit_log`.
 */
export function wrapToolsWithSessionAudit<T extends Record<string, any>>(
  tools: T,
  options: { ownerId: string; sessionId?: string; isMcp?: boolean },
): T {
  const { ownerId, sessionId, isMcp = false } = options;
  const effectiveSessionId = sessionId || "anonymous";
  const wrapped: Record<string, any> = {};

  for (const [toolName, toolDef] of Object.entries(tools)) {
    if (!toolDef || typeof toolDef !== "object" || typeof toolDef.execute !== "function") {
      wrapped[toolName] = toolDef;
      continue;
    }

    const originalExecute = toolDef.execute.bind(toolDef);
    const category = classifyToolCategory(toolName, isMcp);
    const actionName = isMcp ? `mcp.${toolName}` : `tool.${toolName}`;

    wrapped[toolName] = {
      ...toolDef,
      execute: async (args: unknown, execOptions?: { toolCallId?: string; [k: string]: unknown }) => {
        const startedAt = Date.now();
        const toolCallId = execOptions?.toolCallId ? String(execOptions.toolCallId) : undefined;

        try {
          const result = await runWithAuditContext(
            {
              ownerId,
              sessionId: effectiveSessionId,
              toolCallId,
              toolName,
            },
            () => originalExecute(args, execOptions),
          );

          const durationMs = Date.now() - startedAt;
          const { isError, errorMessage } = extractResultError(result);

          await recordAudit({
            action: actionName,
            entityType: "chat_session",
            entityId: effectiveSessionId,
            actor: "ai-agent",
            payload: {
              ownerId,
              sessionId: effectiveSessionId,
              category,
              toolName,
              toolCallId: toolCallId ?? null,
              input: sanitizePayloadValue(args ?? {}),
              output: sanitizePayloadValue(result),
              status: isError ? "error" : "success",
              error: errorMessage,
              durationMs,
            },
          }).catch((err) => {
            console.warn("Failed to write tool call audit log:", err);
          });

          return result;
        } catch (err) {
          const durationMs = Date.now() - startedAt;
          const errorMessage = err instanceof Error ? err.message : String(err);

          await recordAudit({
            action: actionName,
            entityType: "chat_session",
            entityId: effectiveSessionId,
            actor: "ai-agent",
            payload: {
              ownerId,
              sessionId: effectiveSessionId,
              category,
              toolName,
              toolCallId: toolCallId ?? null,
              input: sanitizePayloadValue(args ?? {}),
              output: null,
              status: "error",
              error: errorMessage,
              durationMs,
            },
          }).catch((auditErr) => {
            console.warn("Failed to write failed tool call audit log:", auditErr);
          });

          throw err;
        }
      },
    };
  }

  return wrapped as T;
}

export interface RecordLlmGenerationAuditParams {
  ownerId: string;
  sessionId?: string;
  provider: string;
  model: string;
  endpoint?: string;
  stepCount: number;
  finishReason?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  toolCallCount: number;
  toolNames?: string[];
  prompt?: string;
  completion?: string;
  messageCount?: number;
  status?: "success" | "error";
  error?: string | null;
}

/** Records AI Provider chat completion API call & token telemetry for a conversation turn. */
export async function recordLlmGenerationAudit(params: RecordLlmGenerationAuditParams): Promise<void> {
  const effectiveSessionId = params.sessionId || "anonymous";
  const endpoint = params.endpoint || "POST /v1/chat/completions";
  const status = params.status ?? "success";

  await recordAudit({
    action: "ai_provider.chat_completions",
    entityType: "chat_session",
    entityId: effectiveSessionId,
    actor: "ai-agent",
    payload: {
      ownerId: params.ownerId,
      sessionId: effectiveSessionId,
      category: "llm_step",
      toolName: `POST ${endpoint}`,
      endpoint,
      provider: params.provider,
      model: params.model,
      stepCount: params.stepCount,
      finishReason: params.finishReason ?? "stop",
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.totalTokens,
      durationMs: params.durationMs,
      toolCallCount: params.toolCallCount,
      toolNames: params.toolNames ?? [],
      status,
      error: params.error ?? null,
      input: sanitizePayloadValue({
        method: "POST",
        endpoint,
        provider: params.provider,
        model: params.model,
        messageCount: params.messageCount ?? 1,
        prompt: params.prompt ?? "",
      }),
      output: sanitizePayloadValue({
        completion: params.completion ?? "",
        finishReason: params.finishReason ?? "stop",
        stepCount: params.stepCount,
        toolCalls: params.toolNames ?? [],
        tokens: {
          input: params.inputTokens,
          output: params.outputTokens,
          total: params.totalTokens,
        },
      }),
    },
  });
}

export interface SessionAuditEvent {
  id: string;
  sessionId: string;
  sessionTitle: string;
  action: string;
  category: SessionAuditCategory;
  toolName: string | null;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  status: "success" | "error";
  durationMs: number | null;
  tokens: {
    input: number;
    output: number;
    total: number;
  } | null;
  model: string | null;
  stepCount: number | null;
  input: Record<string, unknown> | null;
  output: unknown;
  error: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ToolUsageBreakdown {
  toolName: string;
  category: SessionAuditCategory;
  count: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface SessionAuditSummary {
  totalEvents: number;
  totalToolCalls: number;
  mcpApiCalls: number;
  llmGenerations: number;
  entityMutations: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalDurationMs: number;
  avgToolDurationMs: number;
  toolBreakdown: ToolUsageBreakdown[];
}

export interface SessionAuditListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  eventCount: number;
  llmCallCount: number;
  toolCallCount: number;
  totalTokens: number;
  errorCount: number;
}

export interface SessionAuditQueryOptions {
  sessionId?: string;
  category?: SessionAuditCategory | "all";
  status?: "all" | "success" | "error";
  search?: string;
  limit?: number;
}

export interface SessionAuditResponse {
  sessions: SessionAuditListItem[];
  events: SessionAuditEvent[];
  summary: SessionAuditSummary;
}

function mapRowToSessionAuditEvent(
  row: AuditLogRow,
  sessionTitleMap: Map<string, string>,
): SessionAuditEvent {
  const p = row.payload ?? {};
  const sessionId =
    row.entityType === "chat_session"
      ? row.entityId
      : typeof p.sessionId === "string" && p.sessionId
        ? p.sessionId
        : "unlinked";
  const sessionTitle =
    sessionTitleMap.get(sessionId) ||
    (sessionId === "unlinked" || sessionId === "anonymous" ? "Workspace / Unlinked Session" : sessionId);

  let category: SessionAuditCategory = "entity_mutation";
  if (
    p.category === "workspace_tool" ||
    p.category === "lms_tool" ||
    p.category === "mcp_api" ||
    p.category === "llm_step" ||
    p.category === "entity_mutation"
  ) {
    category = p.category;
  } else if (row.action === "llm.generate" || row.action === "ai_provider.chat_completions") {
    category = "llm_step";
  } else if (row.action.startsWith("mcp.")) {
    category = "mcp_api";
  } else if (row.action.startsWith("tool.")) {
    const tName = typeof p.toolName === "string" ? p.toolName : row.action.replace(/^tool\./, "");
    category = classifyToolCategory(tName, false);
  }

  const toolName =
    typeof p.toolName === "string"
      ? p.toolName
      : category === "llm_step"
        ? typeof p.endpoint === "string"
          ? `POST ${p.endpoint}`
          : "POST /v1/chat/completions"
        : row.action.startsWith("tool.") || row.action.startsWith("mcp.")
          ? row.action.replace(/^(tool|mcp)\./, "")
          : null;

  const status: "success" | "error" =
    p.status === "error" || row.action.endsWith("failure") || row.action.endsWith("error")
      ? "error"
      : "success";

  const durationMs = typeof p.durationMs === "number" ? p.durationMs : null;

  const hasTokens =
    category === "llm_step" ||
    typeof p.totalTokens === "number" ||
    typeof p.inputTokens === "number";

  const tokens = hasTokens
    ? {
        input: Number(p.inputTokens ?? 0),
        output: Number(p.outputTokens ?? 0),
        total: Number(p.totalTokens ?? Number(p.inputTokens ?? 0) + Number(p.outputTokens ?? 0)),
      }
    : null;

  const model =
    typeof p.model === "string"
      ? typeof p.provider === "string" && !p.model.startsWith(`${p.provider}:`)
        ? `${p.provider}:${p.model}`
        : p.model
      : null;

  const stepCount = typeof p.stepCount === "number" ? p.stepCount : null;

  const input =
    p.input && typeof p.input === "object" && !Array.isArray(p.input)
      ? (p.input as Record<string, unknown>)
      : p.before && typeof p.before === "object" && !Array.isArray(p.before)
        ? (p.before as Record<string, unknown>)
        : null;

  const output = p.output !== undefined ? p.output : p.after !== undefined ? p.after : null;
  const error = typeof p.error === "string" ? p.error : null;

  return {
    id: `audit_${row.id}`,
    sessionId,
    sessionTitle,
    action: row.action,
    category,
    toolName,
    entityType: row.entityType,
    entityId: row.entityId,
    actor: row.actor,
    status,
    durationMs,
    tokens,
    model,
    stepCount,
    input,
    output,
    error,
    payload: p,
    createdAt: row.createdAt,
  };
}

interface HistoricalUsageRow {
  id: string;
  model: string;
  tokens: number;
  durationMs: number;
  createdAt: string;
}

/**
 * Extracts historical AI provider chat completion calls (`llm_step`) and tool call events
 * from stored UIMessage parts for sessions that occurred before explicit session audit rows
 * were recorded, enriching with `lms_usage_log` telemetry and avoiding duplicates.
 */
function extractFallbackEventsFromSessions(
  sessions: ChatSession[],
  existingEvents: SessionAuditEvent[],
  usageRows: HistoricalUsageRow[],
  defaultProviderEndpoint: { provider: string; model: string; endpoint: string },
): SessionAuditEvent[] {
  const recordedToolCallIds = new Set<string>();
  const sessionsWithToolAudit = new Set<string>();
  const sessionsWithLlmAuditCount = new Map<string, number>();

  for (const ev of existingEvents) {
    const tcId = ev.payload?.toolCallId;
    if (typeof tcId === "string" && tcId) {
      recordedToolCallIds.add(tcId);
    }
    if (ev.category === "workspace_tool" || ev.category === "lms_tool" || ev.category === "mcp_api") {
      sessionsWithToolAudit.add(ev.sessionId);
    }
    if (ev.category === "llm_step") {
      sessionsWithLlmAuditCount.set(
        ev.sessionId,
        (sessionsWithLlmAuditCount.get(ev.sessionId) ?? 0) + 1,
      );
    }
  }

  const synthesized: SessionAuditEvent[] = [];

  for (const session of sessions) {
    const msgs = session.messages ?? [];
    const sessionBaseTime = new Date(session.updatedAt || session.createdAt).getTime();
    const totalMsgs = msgs.length;

    // Count how many assistant messages this session has vs how many llm_step audit rows exist
    const assistantMsgIndices: number[] = [];
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i]?.role === "assistant") {
        assistantMsgIndices.push(i);
      }
    }

    const existingLlmCount = sessionsWithLlmAuditCount.get(session.id) ?? 0;
    const missingLlmCount = Math.max(0, assistantMsgIndices.length - existingLlmCount);

    // Process assistant messages from oldest to newest
    for (let turnIdx = 0; turnIdx < assistantMsgIndices.length; turnIdx++) {
      const msgIdx = assistantMsgIndices[turnIdx];
      const msg = msgs[msgIdx];
      if (!msg || !Array.isArray(msg.parts)) continue;

      const msgTimestamp = new Date(
        sessionBaseTime - (totalMsgs - 1 - msgIdx) * 1500,
      ).toISOString();

      // Find preceding user message prompt
      let userPrompt = "";
      for (let prev = msgIdx - 1; prev >= 0; prev--) {
        if (msgs[prev]?.role === "user" && Array.isArray(msgs[prev].parts)) {
          userPrompt = msgs[prev].parts
            .filter((p: any) => p?.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join("\n")
            .trim();
          break;
        }
      }

      const completionTexts: string[] = [];
      const turnToolNames: string[] = [];
      let stepStarts = 0;
      let partCounter = 0;

      for (const part of msg.parts) {
        if (!part || typeof part !== "object") continue;
        const pType = String(part.type ?? "");
        const rawPart = part as unknown as Record<string, unknown>;

        if (pType === "step-start") {
          stepStarts += 1;
          continue;
        }

        if (pType === "text" && typeof rawPart.text === "string") {
          completionTexts.push(rawPart.text);
          continue;
        }

        if (pType.startsWith("tool-") || pType === "dynamic-tool") {
          const toolName =
            pType === "dynamic-tool"
              ? String(rawPart.toolName ?? "unknown_tool")
              : pType.replace(/^tool-/, "");
          turnToolNames.push(toolName);

          const toolCallId = typeof rawPart.toolCallId === "string" ? rawPart.toolCallId : undefined;
          if (toolCallId && recordedToolCallIds.has(toolCallId)) continue;
          if (!toolCallId && sessionsWithToolAudit.has(session.id)) continue;

          const isPmMcp = /task|project|issue|ticket|pm|sprint/i.test(toolName) && !toolName.startsWith("lms");
          const category = classifyToolCategory(toolName, isPmMcp);
          const input =
            rawPart.input && typeof rawPart.input === "object" && !Array.isArray(rawPart.input)
              ? (rawPart.input as Record<string, unknown>)
              : {};
          const output = rawPart.output ?? null;
          const { isError, errorMessage } = extractResultError(output);
          const failed = rawPart.state === "error" || isError || Boolean(rawPart.errorText);
          const errText =
            (typeof rawPart.errorText === "string" && rawPart.errorText) || errorMessage || null;

          partCounter += 1;
          synthesized.push({
            id: `msg_${session.id}_${msg.id || msgIdx}_${toolCallId || partCounter}`,
            sessionId: session.id,
            sessionTitle: session.title || "New Chat",
            action: category === "mcp_api" ? `mcp.${toolName}` : `tool.${toolName}`,
            category,
            toolName,
            entityType: "chat_session",
            entityId: session.id,
            actor: "ai-agent",
            status: failed ? "error" : "success",
            durationMs: null,
            tokens: null,
            model: null,
            stepCount: null,
            input,
            output,
            error: errText,
            payload: {
              sessionId: session.id,
              category,
              toolName,
              toolCallId: toolCallId ?? null,
              input,
              output,
              status: failed ? "error" : "success",
              error: errText,
              source: "chat_history",
            },
            createdAt: msgTimestamp,
          });
        }
      }

      // Synthesize the AI Provider HTTP API Call (`ai_provider.chat_completions`) for historical turns
      if (turnIdx < missingLlmCount) {
        const completionText = completionTexts.join("\n").trim();
        // Match from usageRows (ordered newest first) starting from the newest assistant turn
        const reverseTurnOffset = assistantMsgIndices.length - 1 - turnIdx;
        const usageMatch =
          reverseTurnOffset >= 0 && reverseTurnOffset < usageRows.length
            ? usageRows[reverseTurnOffset]
            : undefined;

        const resolvedModel =
          usageMatch?.model || `${defaultProviderEndpoint.provider}:${defaultProviderEndpoint.model}`;
        const [provPrefix] = resolvedModel.includes(":")
          ? resolvedModel.split(":", 2)
          : [defaultProviderEndpoint.provider];

        const endpointUrl =
          provPrefix === "ollama"
            ? `${normalizeProviderBaseUrl("ollama")}/chat/completions`
            : provPrefix === "openrouter"
              ? `${normalizeProviderBaseUrl("openrouter")}/chat/completions`
              : provPrefix === "openai"
                ? `${normalizeProviderBaseUrl("openai")}/chat/completions`
                : defaultProviderEndpoint.endpoint;

        const estInput = estimateTextTokens(userPrompt) + 120; // include system preamble estimate
        const estOutput =
          estimateTextTokens(completionText) + turnToolNames.length * 45;
        const totalTok =
          usageMatch && usageMatch.tokens > 0
            ? usageMatch.tokens
            : estInput + estOutput;
        const inputTok =
          usageMatch && usageMatch.tokens > 0
            ? Math.round(usageMatch.tokens * 0.65)
            : estInput;
        const outputTok =
          usageMatch && usageMatch.tokens > 0
            ? usageMatch.tokens - inputTok
            : estOutput;

        const stepCount = Math.max(1, stepStarts || (turnToolNames.length > 0 ? 2 : 1));
        const durationMs = usageMatch?.durationMs ?? null;
        const createdAt = msgTimestamp;

        synthesized.push({
          id: `llm_${session.id}_${msg.id || turnIdx}`,
          sessionId: session.id,
          sessionTitle: session.title || "New Chat",
          action: "ai_provider.chat_completions",
          category: "llm_step",
          toolName: `POST ${endpointUrl}`,
          entityType: "chat_session",
          entityId: session.id,
          actor: "ai-agent",
          status: "success",
          durationMs,
          tokens: {
            input: inputTok,
            output: outputTok,
            total: totalTok,
          },
          model: resolvedModel,
          stepCount,
          input: {
            method: "POST",
            endpoint: endpointUrl,
            provider: provPrefix,
            model: resolvedModel,
            messageCount: msgIdx + 1,
            prompt: userPrompt,
          },
          output: {
            completion:
              completionText.length > 1500
                ? `${completionText.slice(0, 1500)}…`
                : completionText,
            stepCount,
            toolCalls: turnToolNames,
            tokens: {
              input: inputTok,
              output: outputTok,
              total: totalTok,
            },
          },
          error: null,
          payload: {
            sessionId: session.id,
            category: "llm_step",
            endpoint: endpointUrl,
            provider: provPrefix,
            model: resolvedModel,
            stepCount,
            finishReason: "stop",
            inputTokens: inputTok,
            outputTokens: outputTok,
            totalTokens: totalTok,
            durationMs,
            toolNames: turnToolNames,
            source: "chat_history",
          },
          createdAt,
        });
      }
    }
  }

  return synthesized;
}

function computeAuditSummary(events: SessionAuditEvent[]): SessionAuditSummary {
  let totalToolCalls = 0;
  let mcpApiCalls = 0;
  let llmGenerations = 0;
  let entityMutations = 0;
  let successCount = 0;
  let errorCount = 0;
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalDurationMs = 0;
  let timedToolCallCount = 0;
  let timedToolDurationMs = 0;

  const toolMap = new Map<
    string,
    {
      toolName: string;
      category: SessionAuditCategory;
      count: number;
      successCount: number;
      errorCount: number;
      totalDurationMs: number;
      timedCount: number;
    }
  >();

  for (const ev of events) {
    if (ev.status === "error") {
      errorCount += 1;
    } else {
      successCount += 1;
    }

    if (ev.durationMs !== null && ev.durationMs >= 0) {
      totalDurationMs += ev.durationMs;
    }

    if (ev.tokens) {
      inputTokens += ev.tokens.input;
      outputTokens += ev.tokens.output;
      totalTokens += ev.tokens.total;
    }

    if (ev.category === "llm_step") {
      llmGenerations += 1;
      const llmKey = ev.model ? `AI Provider (${ev.model})` : ev.toolName || "POST /v1/chat/completions";
      const existing = toolMap.get(llmKey) ?? {
        toolName: llmKey,
        category: "llm_step" as SessionAuditCategory,
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
        timedCount: 0,
      };
      existing.count += 1;
      if (ev.status === "error") {
        existing.errorCount += 1;
      } else {
        existing.successCount += 1;
      }
      if (ev.durationMs !== null && ev.durationMs >= 0) {
        existing.totalDurationMs += ev.durationMs;
        existing.timedCount += 1;
      }
      toolMap.set(llmKey, existing);
    } else if (ev.category === "entity_mutation") {
      entityMutations += 1;
    } else {
      totalToolCalls += 1;
      if (ev.category === "mcp_api") {
        mcpApiCalls += 1;
      }
      if (ev.durationMs !== null && ev.durationMs >= 0) {
        timedToolCallCount += 1;
        timedToolDurationMs += ev.durationMs;
      }

      const key = ev.toolName || ev.action;
      const existing = toolMap.get(key) ?? {
        toolName: key,
        category: ev.category,
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
        timedCount: 0,
      };
      existing.count += 1;
      if (ev.status === "error") {
        existing.errorCount += 1;
      } else {
        existing.successCount += 1;
      }
      if (ev.durationMs !== null && ev.durationMs >= 0) {
        existing.totalDurationMs += ev.durationMs;
        existing.timedCount += 1;
      }
      toolMap.set(key, existing);
    }
  }

  const totalEvents = events.length;
  const successRate = totalEvents > 0 ? Math.round((successCount / totalEvents) * 100) : 100;
  const avgToolDurationMs =
    timedToolCallCount > 0 ? Math.round(timedToolDurationMs / timedToolCallCount) : 0;

  const toolBreakdown: ToolUsageBreakdown[] = Array.from(toolMap.values())
    .map((t) => ({
      toolName: t.toolName,
      category: t.category,
      count: t.count,
      successCount: t.successCount,
      errorCount: t.errorCount,
      totalDurationMs: t.totalDurationMs,
      avgDurationMs: t.timedCount > 0 ? Math.round(t.totalDurationMs / t.timedCount) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.totalDurationMs - a.totalDurationMs);

  return {
    totalEvents,
    totalToolCalls,
    mcpApiCalls,
    llmGenerations,
    entityMutations,
    successCount,
    errorCount,
    successRate,
    totalTokens,
    inputTokens,
    outputTokens,
    totalDurationMs,
    avgToolDurationMs,
    toolBreakdown,
  };
}

/**
 * Queries session-level audit logs, AI provider API calls, tool calls, and linked entity mutations
 * for a given owner, with optional filtering by session, category, status, and search query.
 */
export async function querySessionAuditLogs(
  ownerId: string,
  options: SessionAuditQueryOptions = {},
): Promise<SessionAuditResponse> {
  const limit = Math.min(Math.max(options.limit ?? 250, 1), 1000);
  const sessions = await listChatSessions(ownerId);
  const sessionIds = sessions.map((s) => s.id);
  const sessionTitleMap = new Map<string, string>(
    sessions.map((s) => [s.id, s.title || "New Chat"]),
  );

  // Resolve owner's default AI provider & endpoint for historical backfill
  let defaultProviderEndpoint = {
    provider: "ollama",
    model: AI_PROVIDER_CATALOG.ollama.defaultChatModel,
    endpoint: `${AI_PROVIDER_CATALOG.ollama.defaultBaseUrl}/chat/completions`,
  };
  try {
    const aiCfg = await getUserAiConfig(ownerId);
    const baseUrl = normalizeProviderBaseUrl(
      aiCfg.chatProvider,
      aiCfg.providers[aiCfg.chatProvider]?.baseUrl,
    );
    defaultProviderEndpoint = {
      provider: aiCfg.chatProvider,
      model: aiCfg.chatModel,
      endpoint: `${baseUrl}/chat/completions`,
    };
  } catch {}

  // Fetch historical usage telemetry from lms_usage_log if available
  let usageRows: HistoricalUsageRow[] = [];
  try {
    const uRows = await getDb().query(
      `select id, model, tokens, duration_ms, created_at
       from lms_usage_log
       where owner_id = $1 and operation = 'agent_tool'
       order by created_at desc
       limit 200`,
      [ownerId],
    );
    usageRows = uRows.map((r) => ({
      id: String(r.id),
      model: String(r.model ?? ""),
      tokens: Number(r.tokens ?? 0),
      durationMs: Number(r.duration_ms ?? 0),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  } catch {}

  // Fetch audit_log rows belonging to this owner or any of the owner's chat sessions
  const rawRows: Row[] = await getDb().query(
    `select id, action, entity_type, entity_id, actor, payload, created_at
     from audit_log
     where entity_id != 'test_check'
       and (
         coalesce(payload->>'ownerId', payload->>'owner_id', '') = $1
         or (entity_type = 'chat_session' and entity_id = any($2::text[]))
         or (payload->>'sessionId' is not null and payload->>'sessionId' = any($2::text[]))
         or ($1 = '' and actor = 'ai-agent')
       )
     order by created_at desc, id desc
     limit $3`,
    [ownerId, sessionIds, limit],
  );

  const dbAuditRows: AuditLogRow[] = rawRows.map((r) => ({
    id: String(r.id),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actor: r.actor as AuditActor,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const mappedDbEvents = dbAuditRows.map((r) => mapRowToSessionAuditEvent(r, sessionTitleMap));
  const fallbackEvents = extractFallbackEventsFromSessions(
    sessions,
    mappedDbEvents,
    usageRows,
    defaultProviderEndpoint,
  );

  const allEvents = [...mappedDbEvents, ...fallbackEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Compute per-session counters before applying active filters so the session selector shows accurate badges
  const sessionStatsMap = new Map<
    string,
    {
      eventCount: number;
      llmCallCount: number;
      toolCallCount: number;
      totalTokens: number;
      errorCount: number;
    }
  >();
  for (const ev of allEvents) {
    const cur = sessionStatsMap.get(ev.sessionId) ?? {
      eventCount: 0,
      llmCallCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      errorCount: 0,
    };
    cur.eventCount += 1;
    if (ev.category === "llm_step") {
      cur.llmCallCount += 1;
    } else if (
      ev.category === "workspace_tool" ||
      ev.category === "lms_tool" ||
      ev.category === "mcp_api"
    ) {
      cur.toolCallCount += 1;
    }
    if (ev.tokens) {
      cur.totalTokens += ev.tokens.total;
    }
    if (ev.status === "error") {
      cur.errorCount += 1;
    }
    sessionStatsMap.set(ev.sessionId, cur);
  }

  const sessionListItems: SessionAuditListItem[] = sessions.map((s) => {
    const st = sessionStatsMap.get(s.id) ?? {
      eventCount: 0,
      llmCallCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      errorCount: 0,
    };
    return {
      id: s.id,
      title: s.title || "New Chat",
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      eventCount: st.eventCount,
      llmCallCount: st.llmCallCount,
      toolCallCount: st.toolCallCount,
      totalTokens: st.totalTokens,
      errorCount: st.errorCount,
    };
  });

  // Apply user filters
  const filteredEvents = allEvents.filter((ev) => {
    if (options.sessionId && options.sessionId !== "all") {
      if (ev.sessionId !== options.sessionId) return false;
    }
    if (options.category && options.category !== "all") {
      if (ev.category !== options.category) return false;
    }
    if (options.status && options.status !== "all") {
      if (ev.status !== options.status) return false;
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      const haystack = [
        ev.action,
        ev.toolName ?? "",
        ev.sessionTitle,
        ev.entityType,
        ev.entityId,
        ev.model ?? "",
        ev.error ?? "",
        JSON.stringify(ev.input ?? {}),
        JSON.stringify(ev.output ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const summary = computeAuditSummary(filteredEvents);

  return {
    sessions: sessionListItems,
    events: filteredEvents,
    summary,
  };
}

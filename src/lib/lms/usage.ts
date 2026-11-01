import { getDb } from "@/lib/db";
import { LMSValidationError } from "./subjects";

export interface RecordUsageParams {
  ownerId: string;
  subjectId?: string | null;
  nodeId?: string | null;
  operation: "embedding" | "llm_judge" | "rag_query" | "agent_tool";
  model?: string;
  tokens?: number;
  durationMs?: number;
}

export interface UsageReport {
  totalTokens: number;
  totalCostEstimate: number;
  operationCounts: Record<string, number>;
}

export const DAILY_LIMITS: Record<string, number> = {
  embedding: 2000,
  llm_judge: 500,
  rag_query: 2000,
  agent_tool: 5000,
};

/**
 * Calculates a conservative estimated USD cost based on token usage and model family.
 */
function estimateCost(operation: string, tokens: number, model?: string): number {
  if (tokens <= 0) return 0.0;
  if (operation === "embedding") {
    // ~$0.00002 per 1k tokens (text-embedding-3-small rate)
    return (tokens / 1000) * 0.00002;
  }
  if (model?.includes("120b") || model?.includes("pro")) {
    return (tokens / 1000) * 0.002;
  }
  // Standard flash / fast tier: ~$0.0005 per 1k tokens
  return (tokens / 1000) * 0.0005;
}

/**
 * Records an operation in lms_usage_log and outputs structured telemetry JSON.
 */
export async function recordUsage(params: RecordUsageParams): Promise<void> {
  const db = getDb();
  const id = `usage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tokens = params.tokens ?? 0;
  const durationMs = params.durationMs ?? 0;
  const model = params.model ?? "default";
  const cost = estimateCost(params.operation, tokens, model);

  try {
    await db.query(
      `insert into lms_usage_log (
         id, owner_id, subject_id, node_id, operation, model, tokens, cost_estimate, duration_ms, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [
        id,
        params.ownerId,
        params.subjectId ?? null,
        params.nodeId ?? null,
        params.operation,
        model,
        tokens,
        cost,
        durationMs,
      ],
    );
  } catch (err) {
    // If migration hasn't run yet or transient failure, don't break the user flow
    console.warn("Failed to write to lms_usage_log:", err);
  }

  // Structured console telemetry (design §7.4)
  if (process.env.NODE_ENV !== "test") {
    console.log(
      JSON.stringify({
        telemetry: "lms_cost_event",
        id,
        ownerId: params.ownerId,
        subjectId: params.subjectId,
        nodeId: params.nodeId,
        operation: params.operation,
        model,
        tokens,
        costUsd: cost,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Checks whether an owner has exceeded their 24-hour rate limit for a specific operation.
 */
export async function checkRateLimit(
  ownerId: string,
  operation: "embedding" | "llm_judge" | "rag_query" | "agent_tool",
): Promise<{ allowed: boolean; currentDailyCount: number; limit: number }> {
  const limit = DAILY_LIMITS[operation] ?? 1000;
  const db = getDb();

  try {
    const rows = await db.query(
      `select count(*)::int as daily_count
       from lms_usage_log
       where owner_id = $1 and operation = $2 and created_at >= now() - interval '24 hours'`,
      [ownerId, operation],
    );

    const count = Number(rows[0]?.daily_count ?? 0);
    return {
      allowed: count < limit,
      currentDailyCount: count,
      limit,
    };
  } catch {
    // Safe fallback if table not yet migrated
    return { allowed: true, currentDailyCount: 0, limit };
  }
}

/**
 * Enforces rate limit, throwing an LMSValidationError if the daily budget is exceeded.
 */
export async function assertRateLimit(
  ownerId: string,
  operation: "embedding" | "llm_judge" | "rag_query" | "agent_tool",
): Promise<void> {
  const status = await checkRateLimit(ownerId, operation);
  if (!status.allowed) {
    throw new LMSValidationError(
      `Daily rate limit exceeded for ${operation} (${status.currentDailyCount}/${status.limit} per 24h). Try again tomorrow.`,
    );
  }
}

/**
 * Generates aggregated usage and cost report for a subject.
 */
export async function getSubjectUsageReport(
  ownerId: string,
  subjectId: string,
): Promise<UsageReport> {
  const db = getDb();
  try {
    const rows = await db.query(
      `select operation, count(*)::int as count, coalesce(sum(tokens), 0)::int as tokens, coalesce(sum(cost_estimate), 0)::numeric as cost
       from lms_usage_log
       where owner_id = $1 and subject_id = $2
       group by operation`,
      [ownerId, subjectId],
    );

    let totalTokens = 0;
    let totalCostEstimate = 0.0;
    const operationCounts: Record<string, number> = {};

    for (const r of rows) {
      const op = String(r.operation);
      const opCount = Number(r.count);
      const opTokens = Number(r.tokens);
      const opCost = Number(r.cost);

      totalTokens += opTokens;
      totalCostEstimate += opCost;
      operationCounts[op] = opCount;
    }

    return {
      totalTokens,
      totalCostEstimate: parseFloat(totalCostEstimate.toFixed(6)),
      operationCounts,
    };
  } catch {
    return { totalTokens: 0, totalCostEstimate: 0.0, operationCounts: {} };
  }
}

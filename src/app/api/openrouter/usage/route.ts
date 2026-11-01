import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import { getUserAiConfig } from "@/lib/ai";
import { getDb } from "@/lib/db";

export const maxDuration = 15;

export interface OpenRouterModelStat {
  model: string;
  requests: number;
  tokens: number;
  isFreeModel: boolean;
}

export interface OpenRouterUsageResponse {
  ok: boolean;
  error?: string;
  data?: {
    keyLabel: string;
    isFreeTier: boolean;
    dailyFreeLimit: number;
    freeRequests24h: number;
    freeRemaining: number;
    freePercentRemaining: number;
    totalCreditsUsd: number;
    totalUsageUsd: number;
    remainingCreditsUsd: number;
    usageDailyUsd: number;
    usageWeeklyUsd: number;
    usageMonthlyUsd: number;
    keyLimitUsd: number | null;
    keyLimitRemainingUsd: number | null;
    rateLimitRpm: number;
    rateLimitInterval: string;
    totals24h: {
      requestCount: number;
      freeRequestCount: number;
      tokens: number;
    };
    models24h: OpenRouterModelStat[];
  };
}

export async function GET() {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const aiConfig = await getUserAiConfig(owner);
  const apiKey =
    aiConfig.providers.openrouter?.apiKey?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "OpenRouter API key is not configured in AI Provider settings or .env.",
    });
  }

  try {
    const [keyRes, creditsRes] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/key", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
      fetch("https://openrouter.ai/api/v1/credits", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
    ]);

    if (!keyRes.ok) {
      const errText = await keyRes.text();
      return NextResponse.json({
        ok: false,
        error: `OpenRouter API returned ${keyRes.status}: ${errText}`,
      });
    }

    const keyJson = (await keyRes.json()) as {
      data?: {
        label?: string;
        usage?: number;
        usage_daily?: number;
        usage_weekly?: number;
        usage_monthly?: number;
        limit?: number | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
        rate_limit?: {
          requests?: number;
          interval?: string;
        };
      };
    };

    const creditsJson = creditsRes.ok
      ? ((await creditsRes.json()) as {
          data?: {
            total_credits?: number;
            total_usage?: number;
          };
        })
      : null;

    // Query local 24h telemetry in lms_usage_log for OpenRouter models
    let models24h: OpenRouterModelStat[] = [];
    let totalRequests24h = 0;
    let freeRequests24h = 0;
    let totalTokens24h = 0;

    try {
      const db = getDb();
      const rows = await db.query(
        `select model, count(*)::int as req_count, coalesce(sum(tokens), 0)::int as total_tokens
         from lms_usage_log
         where owner_id = $1
           and created_at >= now() - interval '24 hours'
           and (model like 'openrouter:%' or model like '%/%')
         group by model
         order by req_count desc`,
        [owner],
      );

      models24h = rows.map((r) => {
        const rawModel = String(r.model || "").replace(/^openrouter:/, "");
        const reqs = Number(r.req_count ?? 0);
        const toks = Number(r.total_tokens ?? 0);
        const isFree =
          rawModel.endsWith(":free") || rawModel === "openrouter/free";
        totalRequests24h += reqs;
        totalTokens24h += toks;
        if (isFree) {
          freeRequests24h += reqs;
        }
        return {
          model: rawModel,
          requests: reqs,
          tokens: toks,
          isFreeModel: isFree,
        };
      });
    } catch {
      // Ignore if lms_usage_log is not yet migrated
    }

    const keyData = keyJson.data ?? {};
    const isFreeTier = keyData.is_free_tier ?? true;
    // OpenRouter free model daily limit: 50 req/day on free tier (<$10 credits), 1000 req/day with >=$10 credits
    const dailyFreeLimit = isFreeTier ? 50 : 1000;
    const freeRemaining = Math.max(0, dailyFreeLimit - freeRequests24h);
    const freePercentRemaining =
      dailyFreeLimit > 0
        ? Math.max(0, Math.min(100, Math.round((freeRemaining / dailyFreeLimit) * 100)))
        : 100;

    const totalCreditsUsd = creditsJson?.data?.total_credits ?? 0;
    const totalUsageUsd = creditsJson?.data?.total_usage ?? keyData.usage ?? 0;
    const remainingCreditsUsd = Math.max(0, totalCreditsUsd - totalUsageUsd);

    return NextResponse.json({
      ok: true,
      data: {
        keyLabel: keyData.label || "OpenRouter Key",
        isFreeTier,
        dailyFreeLimit,
        freeRequests24h,
        freeRemaining,
        freePercentRemaining,
        totalCreditsUsd,
        totalUsageUsd,
        remainingCreditsUsd,
        usageDailyUsd: keyData.usage_daily ?? 0,
        usageWeeklyUsd: keyData.usage_weekly ?? 0,
        usageMonthlyUsd: keyData.usage_monthly ?? 0,
        keyLimitUsd: keyData.limit ?? null,
        keyLimitRemainingUsd: keyData.limit_remaining ?? null,
        rateLimitRpm: keyData.rate_limit?.requests ?? 20,
        rateLimitInterval: keyData.rate_limit?.interval ?? "60s",
        totals24h: {
          requestCount: totalRequests24h,
          freeRequestCount: freeRequests24h,
          tokens: totalTokens24h,
        },
        models24h,
      },
    } satisfies OpenRouterUsageResponse);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error fetching OpenRouter usage.",
    });
  }
}

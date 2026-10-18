import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";

export const maxDuration = 15;

export interface OllamaUsageResponse {
  ok: boolean;
  error?: string;
  data?: {
    balanceUsd: number;
    allowanceUsd: number;
    usedUsd: number;
    percentUsed: number;
    resetAt: string;
    periodFrom: string;
    purchasedBalanceUsd: number;
    totals24h: {
      requestCount: number;
      usageUsd: number;
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export async function GET() {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "OLLAMA_API_KEY is not configured.",
    });
  }

  try {
    const [balanceRes, usageRes] = await Promise.all([
      fetch("https://ollama.com/api/balance", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
      fetch("https://ollama.com/api/usage?range=24h", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
    ]);

    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      return NextResponse.json({
        ok: false,
        error: `Ollama balance API returned ${balanceRes.status}: ${errText}`,
      });
    }

    const balanceJson = (await balanceRes.json()) as {
      included?: {
        balance_usd?: number;
        allowance_usd?: number;
        period?: {
          from?: string;
          until?: string;
        };
      };
      purchased?: {
        balance_usd?: number;
      };
    };

    const usageJson = usageRes.ok
      ? ((await usageRes.json()) as {
          totals?: {
            request_count?: number;
            usage_usd?: number;
            input_tokens?: number;
            output_tokens?: number;
          };
        })
      : null;

    const balanceUsd = balanceJson.included?.balance_usd ?? 0;
    const allowanceUsd = balanceJson.included?.allowance_usd ?? 0;
    const purchasedBalanceUsd = balanceJson.purchased?.balance_usd ?? 0;
    const usedUsd = Math.max(0, allowanceUsd - balanceUsd);
    const percentUsed = allowanceUsd > 0 ? Math.min(100, Math.round((usedUsd / allowanceUsd) * 100)) : 0;
    const resetAt = balanceJson.included?.period?.until ?? "";
    const periodFrom = balanceJson.included?.period?.from ?? "";

    const totals24h = {
      requestCount: usageJson?.totals?.request_count ?? 0,
      usageUsd: usageJson?.totals?.usage_usd ?? 0,
      inputTokens: usageJson?.totals?.input_tokens ?? 0,
      outputTokens: usageJson?.totals?.output_tokens ?? 0,
    };

    return NextResponse.json({
      ok: true,
      data: {
        balanceUsd,
        allowanceUsd,
        usedUsd,
        percentUsed,
        resetAt,
        periodFrom,
        purchasedBalanceUsd,
        totals24h,
      },
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch Ollama usage.",
    });
  }
}

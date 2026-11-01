"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  Calendar,
  Clock,
  Cpu,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { OllamaUsageResponse } from "@/app/api/ollama/usage/route";
import type { OpenRouterUsageResponse } from "@/app/api/openrouter/usage/route";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(amount < 0.01 && amount > 0 ? 4 : 2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toLocaleString();
}

function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatRemainingTime(isoString: string): string {
  try {
    const diffMs = new Date(isoString).getTime() - Date.now();
    if (diffMs <= 0) return "Resetting soon";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  } catch {
    return "";
  }
}

function QuotaRing({
  percent,
  size = 24,
  loading,
  showLabel = false,
}: {
  percent: number;
  size?: number;
  loading?: boolean;
  showLabel?: boolean;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 -rotate-90 ${loading ? "animate-pulse" : ""}`}
      role="img"
      aria-label={`${clamped}% quota remaining`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
        className={`transition-all duration-300 ${clamped > 20 ? "stroke-ok" : "stroke-danger"}`}
      />
    </svg>
  );

  if (!showLabel) return svg;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {svg}
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none text-fg">
        {Math.round(clamped)}
      </span>
    </span>
  );
}

function formatResetDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function OllamaUsageModal({
  variant = "pill",
  collapsed = false,
}: {
  variant?: "pill" | "sidebar" | "icon";
  collapsed?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ollama" | "openrouter">("ollama");
  const [isLoading, setIsLoading] = useState(false);

  const [ollamaData, setOllamaData] = useState<
    OllamaUsageResponse["data"] | null
  >(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  const [orData, setOrData] = useState<OpenRouterUsageResponse["data"] | null>(
    null,
  );
  const [orError, setOrError] = useState<string | null>(null);

  const fetchUsage = async () => {
    setIsLoading(true);
    setOllamaError(null);
    setOrError(null);

    try {
      const [ollamaRes, orRes, cfgRes] = await Promise.all([
        fetch("/api/ollama/usage", { cache: "no-store" }).catch(() => null),
        fetch("/api/openrouter/usage", { cache: "no-store" }).catch(() => null),
        fetch("/api/ai/config", { cache: "no-store" }).catch(() => null),
      ]);

      if (cfgRes && cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.chatProvider === "openrouter") {
          setActiveTab("openrouter");
        }
      }

      if (ollamaRes) {
        const json = (await ollamaRes.json()) as OllamaUsageResponse;
        if (json.ok && json.data) {
          setOllamaData(json.data);
        } else {
          setOllamaError(json.error || "Failed to load Ollama usage.");
        }
      }

      if (orRes) {
        const json = (await orRes.json()) as OpenRouterUsageResponse;
        if (json.ok && json.data) {
          setOrData(json.data);
        } else {
          setOrError(json.error || "Failed to load OpenRouter usage.");
        }
      }
    } catch (err) {
      setOllamaError(
        err instanceof Error ? err.message : "Network error loading usage.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsage();
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchUsage();
    }
  }, [isOpen]);

  const balanceUsd = ollamaData?.balanceUsd ?? 0;
  const allowanceUsd = ollamaData?.allowanceUsd ?? 0;
  const ollamaPercentRemaining =
    allowanceUsd > 0 ? Math.round((balanceUsd / allowanceUsd) * 100) : 100;
  const resetCountdown = ollamaData?.resetAt
    ? formatRemainingTime(ollamaData.resetAt)
    : "";

  const orFreePercentRemaining = orData?.freePercentRemaining ?? 100;
  const primaryPercentRemaining =
    activeTab === "openrouter" && orData
      ? orFreePercentRemaining
      : ollamaPercentRemaining;

  return (
    <>
      {/* Trigger Button */}
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="AI Provider Usage (Ollama & OpenRouter)"
          aria-label="AI Provider Usage"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-subtle cursor-pointer"
        >
          <QuotaRing
            percent={primaryPercentRemaining}
            size={30}
            loading={!ollamaData && !orData}
            showLabel
          />
        </button>
      ) : variant === "sidebar" ? (
        collapsed ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            title={`AI Quota: Ollama ${ollamaPercentRemaining}% · OpenRouter Free ${orFreePercentRemaining}%`}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-subtle transition-all hover:border-accent hover:bg-surface"
          >
            <QuotaRing
              percent={primaryPercentRemaining}
              size={24}
              loading={!ollamaData && !orData}
              showLabel
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            title="View Ollama Cloud & OpenRouter Free Model usage"
            className="group flex w-full flex-col gap-1.5 rounded-xl border border-border bg-surface-subtle/80 p-2 text-left transition-all hover:border-accent/60 hover:bg-surface cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Zap className="h-3.5 w-3.5 text-accent" />
                <span>AI Quota</span>
              </span>
              <span
                className={`font-mono text-xs font-semibold ${
                  primaryPercentRemaining > 20 ? "text-ok" : "text-danger"
                }`}
              >
                {primaryPercentRemaining}% left
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  primaryPercentRemaining > 20 ? "bg-ok" : "bg-danger"
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, primaryPercentRemaining))}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="truncate">
                {orData
                  ? `OR Free: ${orData.freeRemaining}/${orData.dailyFreeLimit}`
                  : ollamaData?.resetAt
                    ? `Resets ${formatResetDate(ollamaData.resetAt)}`
                    : "Loading…"}
              </span>
              <span className="text-[10px] font-medium text-muted/80 group-hover:text-fg group-hover:translate-x-0.5 transition-all shrink-0">
                Details &rsaquo;
              </span>
            </div>
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="View Ollama Cloud & OpenRouter usage"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-accent/40 hover:bg-surface-subtle transition-all cursor-pointer shadow-2xs"
        >
          <Zap className="h-3.5 w-3.5 text-warn" />
          <span className="font-medium font-mono text-[11px]">
            {ollamaData
              ? `${formatUsd(ollamaData.balanceUsd)} / ${formatUsd(ollamaData.allowanceUsd)}`
              : "Quota"}
          </span>
        </button>
      )}

      {/* Modal Dialog */}
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warn-soft text-warn">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-fg">
                      AI Provider Usage & Free Quotas
                    </h3>
                    <p className="text-[11px] text-muted">
                      Ollama Cloud & OpenRouter Free Model limits
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={fetchUsage}
                    disabled={isLoading}
                    title="Refresh usage"
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isLoading ? "animate-spin text-accent" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Close modal"
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Provider Switch Tabs */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-surface-subtle p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("openrouter")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "openrouter"
                      ? "bg-surface text-accent shadow-xs"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>OpenRouter Free</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ollama")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "ollama"
                      ? "bg-surface text-accent shadow-xs"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Ollama Cloud</span>
                </button>
              </div>

              {/* TAB 1: OPENROUTER FREE MODEL & CREDIT USAGE */}
              {activeTab === "openrouter" && (
                <>
                  {orError && (
                    <div className="my-4 flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{orError}</span>
                    </div>
                  )}

                  {orData && (
                    <div className="mt-4 space-y-4">
                      {/* Free Model Daily Quota Card */}
                      <div className="rounded-xl border border-border bg-surface-subtle/50 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                              Free Models Daily Quota
                            </span>
                            <div className="mt-0.5 text-2xl font-bold font-mono text-fg">
                              {orData.freeRemaining}{" "}
                              <span className="text-sm font-normal text-muted">
                                / {orData.dailyFreeLimit} reqs left
                              </span>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              orData.isFreeTier
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {orData.isFreeTier
                              ? "Free Tier (50/day)"
                              : "Paid Tier (1000/day)"}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                            <span className="text-muted">
                              Used {orData.freeRequests24h} `:free` requests (24h)
                            </span>
                            <span
                              className={
                                orData.freePercentRemaining > 20
                                  ? "text-ok"
                                  : "text-danger"
                              }
                            >
                              {orData.freePercentRemaining}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full transition-all duration-300 ${
                                orData.freePercentRemaining > 20
                                  ? "bg-ok"
                                  : "bg-danger"
                              }`}
                              style={{
                                width: `${Math.max(2, orData.freePercentRemaining)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Credits & Rate Limit Grid */}
                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div className="rounded-xl border border-border bg-surface-subtle/30 p-3">
                          <div className="flex items-center gap-1.5 text-muted mb-1">
                            <Zap className="h-3.5 w-3.5 text-accent" />
                            <span className="font-medium text-[11px]">
                              Credits Balance
                            </span>
                          </div>
                          <div className="text-sm font-semibold font-mono text-fg">
                            {formatUsd(orData.remainingCreditsUsd)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted truncate">
                            Today: {formatUsd(orData.usageDailyUsd)} · Month:{" "}
                            {formatUsd(orData.usageMonthlyUsd)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface-subtle/30 p-3">
                          <div className="flex items-center gap-1.5 text-muted mb-1">
                            <Clock className="h-3.5 w-3.5 text-accent" />
                            <span className="font-medium text-[11px]">
                              Free Rate Limit
                            </span>
                          </div>
                          <div className="text-sm font-semibold font-mono text-fg">
                            {orData.rateLimitRpm} req / {orData.rateLimitInterval}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted truncate">
                            Key: {orData.keyLabel}
                          </div>
                        </div>
                      </div>

                      {/* 24h Model Breakdown */}
                      <div className="rounded-xl border border-border bg-surface-subtle/30 p-3.5">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                            <Activity className="h-3.5 w-3.5 text-accent" />
                            <span>24-Hour Model Usage</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted">
                            {orData.totals24h.requestCount} reqs ·{" "}
                            {formatTokens(orData.totals24h.tokens)} tokens
                          </span>
                        </div>

                        {orData.models24h.length === 0 ? (
                          <div className="rounded-lg border border-border/50 bg-surface p-3 text-center text-[11px] text-muted">
                            No OpenRouter model requests recorded in the last 24h yet.
                          </div>
                        ) : (
                          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                            {orData.models24h.map((m) => (
                              <div
                                key={m.model}
                                className="flex items-center justify-between rounded-lg border border-border/50 bg-surface px-2.5 py-1.5 text-xs"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate font-mono text-[11px] text-fg">
                                    {m.model}
                                  </span>
                                  {m.isFreeModel && (
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                      FREE
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[11px] text-muted shrink-0 ml-2">
                                  {m.requests} req · {formatTokens(m.tokens)} tok
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* External links footer */}
                      <div className="flex items-center justify-between border-t border-border pt-3 text-[11px]">
                        <a
                          href="https://openrouter.ai/activity"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1 text-accent hover:underline font-medium"
                        >
                          <span>OpenRouter Activity</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href="https://openrouter.ai/settings/keys"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1 text-muted hover:text-fg font-medium"
                        >
                          <span>Manage Keys & Credits</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: OLLAMA CLOUD USAGE */}
              {activeTab === "ollama" && (
                <>
                  {ollamaError && (
                    <div className="my-4 flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{ollamaError}</span>
                    </div>
                  )}

                  {ollamaData && (
                    <div className="mt-4 space-y-4">
                      {/* Balance & Limit Progress Card */}
                      <div className="rounded-xl border border-border bg-surface-subtle/50 p-4">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                              Remaining Balance
                            </span>
                            <div className="mt-0.5 text-2xl font-bold font-mono text-fg">
                              {formatUsd(ollamaData.balanceUsd)}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                              Limit / Allowance
                            </span>
                            <div className="mt-0.5 text-base font-semibold font-mono text-muted">
                              {formatUsd(ollamaData.allowanceUsd)}
                            </div>
                          </div>
                        </div>

                        {/* Quota Bar */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                            <span className="text-muted">Quota Remaining</span>
                            <span
                              className={
                                ollamaPercentRemaining > 20
                                  ? "text-ok"
                                  : "text-danger"
                              }
                            >
                              {ollamaPercentRemaining}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full transition-all duration-300 ${
                                ollamaPercentRemaining > 20
                                  ? "bg-ok"
                                  : "bg-danger"
                              }`}
                              style={{
                                width: `${Math.max(2, ollamaPercentRemaining)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Reset Time & Period */}
                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div className="rounded-xl border border-border bg-surface-subtle/30 p-3">
                          <div className="flex items-center gap-1.5 text-muted mb-1">
                            <Clock className="h-3.5 w-3.5 text-accent" />
                            <span className="font-medium text-[11px]">
                              Resets In
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-fg">
                            {resetCountdown || "N/A"}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted truncate">
                            {ollamaData.resetAt
                              ? formatDateTime(ollamaData.resetAt)
                              : "End of period"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface-subtle/30 p-3">
                          <div className="flex items-center gap-1.5 text-muted mb-1">
                            <Calendar className="h-3.5 w-3.5 text-accent" />
                            <span className="font-medium text-[11px]">
                              Cycle Window
                            </span>
                          </div>
                          <div className="text-xs font-medium text-fg">
                            Monthly Cycle
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted truncate">
                            {ollamaData.periodFrom
                              ? formatDateTime(ollamaData.periodFrom).split(",")[0]
                              : ""}{" "}
                            –{" "}
                            {ollamaData.resetAt
                              ? formatDateTime(ollamaData.resetAt).split(",")[0]
                              : ""}
                          </div>
                        </div>
                      </div>

                      {/* 24h Activity Breakdown */}
                      <div className="rounded-xl border border-border bg-surface-subtle/30 p-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-fg mb-2.5">
                          <Activity className="h-3.5 w-3.5 text-accent" />
                          <span>24-Hour Activity</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-surface p-2 border border-border/50">
                            <div className="text-xs font-bold text-fg font-mono">
                              {ollamaData.totals24h.requestCount}
                            </div>
                            <div className="text-[10px] text-muted">Requests</div>
                          </div>
                          <div className="rounded-lg bg-surface p-2 border border-border/50">
                            <div className="text-xs font-bold text-fg font-mono">
                              {formatTokens(ollamaData.totals24h.inputTokens)}
                            </div>
                            <div className="text-[10px] text-muted">
                              Input Tokens
                            </div>
                          </div>
                          <div className="rounded-lg bg-surface p-2 border border-border/50">
                            <div className="text-xs font-bold text-fg font-mono">
                              {formatTokens(ollamaData.totals24h.outputTokens)}
                            </div>
                            <div className="text-[10px] text-muted">
                              Output Tokens
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* External links footer */}
                      <div className="flex items-center justify-between border-t border-border pt-3 text-[11px]">
                        <a
                          href="https://ollama.com/settings"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1 text-accent hover:underline font-medium"
                        >
                          <span>Manage Ollama Billing</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href="https://ollama.com/upgrade"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1 text-muted hover:text-fg font-medium"
                        >
                          <span>Upgrade Plan</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

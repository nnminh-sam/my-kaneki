"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { OllamaUsageResponse } from "@/app/api/ollama/usage/route";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(amount < 0.01 ? 4 : 2)}`;
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
}: {
  percent: number;
  size?: number;
  loading?: boolean;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
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
  /** pill: compact balance pill; sidebar: full-width row (icon only when collapsed); icon: square icon button */
  variant?: "pill" | "sidebar" | "icon";
  collapsed?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<OllamaUsageResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ollama/usage");
      const json = (await res.json()) as OllamaUsageResponse;
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load usage data.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error loading usage.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsage();
  }, []);

  const balanceUsd = data?.balanceUsd ?? 0;
  const allowanceUsd = data?.allowanceUsd ?? 0;
  const percentRemaining =
    allowanceUsd > 0 ? Math.round((balanceUsd / allowanceUsd) * 100) : 100;
  const resetCountdown = data?.resetAt ? formatRemainingTime(data.resetAt) : "";

  return (
    <>
      {/* Trigger Button */}
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Ollama Cloud usage"
          aria-label="Ollama Cloud usage"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-subtle cursor-pointer"
        >
          <QuotaRing percent={percentRemaining} size={22} loading={!data} />
        </button>
      ) : variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={`Ollama Cloud quota: ${percentRemaining}% remaining${data?.resetAt ? `, resets ${formatResetDate(data.resetAt)}` : ""}`}
          className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-subtle hover:text-fg cursor-pointer ${
            collapsed ? "md:justify-center" : ""
          }`}
        >
          <QuotaRing percent={percentRemaining} size={24} loading={!data} />
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-medium leading-tight text-fg">
                Quota
              </p>
              <p className="truncate text-[11px] text-muted/80">
                {data?.resetAt
                  ? `Resets ${formatResetDate(data.resetAt)}`
                  : `${percentRemaining}% left`}
              </p>
            </div>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="View Ollama Cloud quota, usage, and reset time"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-accent/40 hover:bg-surface-subtle transition-all cursor-pointer shadow-2xs"
        >
          <Zap className="h-3.5 w-3.5 text-warn" />
          <span className="font-medium font-mono text-[11px]">
            {data
              ? `${formatUsd(data.balanceUsd)} / ${formatUsd(data.allowanceUsd)}`
              : "Quota"}
          </span>
        </button>
      )}

      {/* Modal Dialog */}
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
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
                      Ollama Cloud Usage & Limits
                    </h3>
                    <p className="text-[11px] text-muted">
                      Account quota and monthly allowance
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

              {/* Error view */}
              {error && (
                <div className="my-4 flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Content view */}
              {data && (
                <div className="mt-4 space-y-4">
                  {/* Balance & Limit Progress Card */}
                  <div className="rounded-xl border border-border bg-surface-subtle/50 p-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                          Remaining Balance
                        </span>
                        <div className="mt-0.5 text-2xl font-bold font-mono text-fg">
                          {formatUsd(data.balanceUsd)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                          Limit / Allowance
                        </span>
                        <div className="mt-0.5 text-base font-semibold font-mono text-muted">
                          {formatUsd(data.allowanceUsd)}
                        </div>
                      </div>
                    </div>

                    {/* Quota Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                        <span className="text-muted">Quota Remaining</span>
                        <span
                          className={
                            percentRemaining > 20 ? "text-ok" : "text-danger"
                          }
                        >
                          {percentRemaining}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full transition-all duration-300 ${
                            percentRemaining > 20 ? "bg-ok" : "bg-danger"
                          }`}
                          style={{ width: `${Math.max(2, percentRemaining)}%` }}
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
                        {data.resetAt
                          ? formatDateTime(data.resetAt)
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
                        {data.periodFrom
                          ? formatDateTime(data.periodFrom).split(",")[0]
                          : ""}{" "}
                        –{" "}
                        {data.resetAt
                          ? formatDateTime(data.resetAt).split(",")[0]
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
                          {data.totals24h.requestCount}
                        </div>
                        <div className="text-[10px] text-muted">Requests</div>
                      </div>
                      <div className="rounded-lg bg-surface p-2 border border-border/50">
                        <div className="text-xs font-bold text-fg font-mono">
                          {formatTokens(data.totals24h.inputTokens)}
                        </div>
                        <div className="text-[10px] text-muted">
                          Input Tokens
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface p-2 border border-border/50">
                        <div className="text-xs font-bold text-fg font-mono">
                          {formatTokens(data.totals24h.outputTokens)}
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
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

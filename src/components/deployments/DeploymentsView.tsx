"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Search,
  Settings2,
  Terminal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  redeployVercelDeploymentAction,
  saveVercelConfigAction,
} from "@/actions/vercel";
import type { VercelDeploymentsApiResponse } from "@/app/api/vercel/deployments/route";
import type { VercelEventsApiResponse } from "@/app/api/vercel/deployments/[id]/events/route";
import type {
  VercelBuildLogEvent,
  VercelDashboardData,
  VercelDeploymentItem,
  VercelDeploymentState,
} from "@/lib/vercel";

function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.round((Date.now() - timestampMs) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return "—";
  const totalSec = Math.round(durationMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${secs}s`;
}

export function DeploymentStateBadge({
  state,
  size = "md",
}: {
  state: VercelDeploymentState;
  size?: "sm" | "md";
}) {
  const textClass = size === "sm" ? "text-[11px]" : "text-xs";
  const padClass = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-0.5";

  switch (state) {
    case "READY":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 font-medium text-emerald-600 dark:text-emerald-400 ${padClass} ${textClass}`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Ready</span>
        </span>
      );
    case "BUILDING":
    case "INITIALIZING":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 font-medium text-amber-600 dark:text-amber-400 ${padClass} ${textClass}`}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{state === "INITIALIZING" ? "Initializing" : "Building"}</span>
        </span>
      );
    case "QUEUED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 font-medium text-blue-600 dark:text-blue-400 ${padClass} ${textClass}`}
        >
          <Clock className="h-3 w-3" />
          <span>Queued</span>
        </span>
      );
    case "ERROR":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-danger-soft font-medium text-danger ${padClass} ${textClass}`}
        >
          <span className="h-2 w-2 rounded-full bg-danger" />
          <span>Error</span>
        </span>
      );
    case "CANCELED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-surface-subtle font-medium text-muted ${padClass} ${textClass}`}
        >
          <span className="h-2 w-2 rounded-full bg-muted" />
          <span>Canceled</span>
        </span>
      );
  }
}

export function DeploymentsView({
  initialData,
  initialError,
}: {
  initialData: VercelDashboardData;
  initialError?: string | null;
}) {
  const [dashboard, setDashboard] = useState<VercelDashboardData>(initialData);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    initialError ?? null,
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSettings, setShowSettings] = useState(
    !initialData.config.configured,
  );

  // Token config form state
  const [tokenInput, setTokenInput] = useState("");
  const [teamIdInput, setTeamIdInput] = useState(
    initialData.config.teamId || "",
  );
  const [isSavingConfig, startConfigTransition] = useTransition();

  // Filter states
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedTarget, setSelectedTarget] = useState<
    "all" | "production" | "preview"
  >("all");
  const [selectedState, setSelectedState] = useState<"all" | VercelDeploymentState>(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Redeploy state
  const [redeployingId, setRedeployingId] = useState<string | null>(null);

  // Build Logs Modal state
  const [activeLogDeployment, setActiveLogDeployment] =
    useState<VercelDeploymentItem | null>(null);
  const [logEvents, setLogEvents] = useState<VercelBuildLogEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [copiedLogs, setCopiedLogs] = useState(false);

  const refreshDeployments = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/vercel/deployments?limit=60", {
        cache: "no-store",
      });
      const json = (await res.json()) as VercelDeploymentsApiResponse;
      if (json.data) {
        setDashboard(json.data);
      }
      if (!json.ok && json.error) {
        setErrorMsg(json.error);
      } else {
        setErrorMsg(null);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Network error refreshing Vercel deployments.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const hasActiveBuilds =
    dashboard.counts.building > 0 || dashboard.counts.queued > 0;

  useEffect(() => {
    if (!autoRefresh || !dashboard.config.configured) return;
    const intervalMs = hasActiveBuilds ? 8_000 : 20_000;
    const timer = setInterval(() => {
      void refreshDeployments();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [
    autoRefresh,
    dashboard.config.configured,
    hasActiveBuilds,
    refreshDeployments,
  ]);

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setStatusBanner(null);
    startConfigTransition(async () => {
      const res = await saveVercelConfigAction({
        apiToken: tokenInput.trim() || undefined,
        teamId: teamIdInput.trim(),
      });
      if (!res.ok) {
        setStatusBanner({
          type: "error",
          text: res.error || "Failed to save Vercel settings.",
        });
        return;
      }
      setTokenInput("");
      setStatusBanner({
        type: "success",
        text: "Vercel API configuration saved.",
      });
      setShowSettings(false);
      await refreshDeployments();
    });
  }

  function handleClearToken() {
    setStatusBanner(null);
    startConfigTransition(async () => {
      const res = await saveVercelConfigAction({
        clearToken: true,
        teamId: "",
      });
      if (!res.ok) {
        setStatusBanner({
          type: "error",
          text: res.error || "Failed to clear Vercel token.",
        });
        return;
      }
      setTokenInput("");
      setTeamIdInput("");
      setStatusBanner({
        type: "success",
        text: "Stored Vercel token removed from database.",
      });
      await refreshDeployments();
    });
  }

  async function handleRedeploy(dep: VercelDeploymentItem) {
    setRedeployingId(dep.id);
    setStatusBanner(null);
    try {
      const res = await redeployVercelDeploymentAction({
        deploymentId: dep.id,
        name: dep.name,
        target: dep.target,
      });
      if (!res.ok || !res.deployment) {
        setStatusBanner({
          type: "error",
          text: res.error || `Failed to redeploy ${dep.name}.`,
        });
        return;
      }
      setStatusBanner({
        type: "success",
        text: `Triggered redeploy for ${dep.name} (${res.deployment.url || res.deployment.id}).`,
      });
      await refreshDeployments();
    } finally {
      setRedeployingId(null);
    }
  }

  async function openBuildLogs(dep: VercelDeploymentItem) {
    setActiveLogDeployment(dep);
    setLogEvents([]);
    setLogsError(null);
    setLogSearch("");
    setLogsLoading(true);

    try {
      const res = await fetch(
        `/api/vercel/deployments/${encodeURIComponent(dep.id)}/events`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as VercelEventsApiResponse;
      if (!json.ok) {
        setLogsError(json.error || "Failed to load build logs.");
      } else {
        setLogEvents(json.events ?? []);
      }
    } catch (err) {
      setLogsError(
        err instanceof Error ? err.message : "Failed to load build logs.",
      );
    } finally {
      setLogsLoading(false);
    }
  }

  async function copyLogsToClipboard() {
    const text = filteredLogs
      .map(
        (evt) =>
          `[${new Date(evt.timestamp).toISOString()}] ${evt.text}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch {}
  }

  const filteredDeployments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dashboard.deployments.filter((d) => {
      if (selectedProject !== "all" && d.name !== selectedProject) {
        return false;
      }
      if (selectedTarget !== "all" && d.target !== selectedTarget) {
        return false;
      }
      if (selectedState !== "all") {
        if (
          selectedState === "BUILDING" &&
          d.state !== "BUILDING" &&
          d.state !== "INITIALIZING"
        ) {
          return false;
        } else if (
          selectedState !== "BUILDING" &&
          d.state !== selectedState
        ) {
          return false;
        }
      }
      if (q) {
        const hay = [
          d.name,
          d.branch,
          d.commitSha,
          d.commitMessage,
          d.commitAuthor,
          d.url,
          d.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    dashboard.deployments,
    selectedProject,
    selectedTarget,
    selectedState,
    searchQuery,
  ]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logEvents;
    return logEvents.filter((e) => e.text.toLowerCase().includes(q));
  }, [logEvents, logSearch]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-fg">
                Vercel Deployments
              </h1>
              <p className="text-xs text-muted">
                Live deployment status, commit metadata, build logs &amp;
                one-click redeploy across all projects
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            title={
              autoRefresh
                ? "Auto-refresh is active (every 8–20s)"
                : "Enable live auto-refresh"
            }
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              autoRefresh
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-surface text-muted hover:text-fg"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-muted"
              }`}
            />
            <span>{autoRefresh ? "Live Sync" : "Paused"}</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => void refreshDeployments()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-accent" : ""}`}
            />
            <span>Refresh</span>
          </button>

          {/* Token & Team Settings */}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              showSettings || !dashboard.config.configured
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-fg hover:bg-surface-subtle"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>
              {dashboard.config.configured ? "Vercel Config" : "Connect Vercel"}
            </span>
          </button>
        </div>
      </div>

      {/* Status feedback banner */}
      {statusBanner && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            statusBanner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="rounded p-1 hover:bg-black/10 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* API Error banner */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {/* Collapsible Vercel API Token & Team Configuration */}
      {showSettings && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-fg">
                    Vercel Access Token &amp; Team Configuration
                  </h2>
                  {dashboard.config.configured ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Connected ({dashboard.config.source.toUpperCase()})
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      Not Configured
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Create a Personal Access Token at{" "}
                  <a
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-accent hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>vercel.com/account/tokens</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  . Stored securely in Neon PostgreSQL (or set{" "}
                  <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px]">
                    VERCEL_ACCESS_TOKEN
                  </code>{" "}
                  in <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px]">.env.local</code>).
                </p>
              </div>
            </div>

            {dashboard.config.configured && (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1 text-muted hover:bg-surface-subtle hover:text-fg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <form
            onSubmit={handleSaveConfig}
            className="grid gap-3 sm:grid-cols-12"
          >
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-muted mb-1">
                Vercel Access Token{" "}
                {dashboard.config.maskedToken && (
                  <span className="font-mono text-[11px] text-fg">
                    ({dashboard.config.maskedToken})
                  </span>
                )}
              </label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={
                  dashboard.config.configured
                    ? "Leave blank to keep existing token"
                    : "Paste Vercel Access Token..."
                }
                className="w-full rounded-xl border border-border bg-bg px-3.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-muted mb-1">
                Team ID (Optional)
              </label>
              <input
                type="text"
                value={teamIdInput}
                onChange={(e) => setTeamIdInput(e.target.value)}
                placeholder="team_xxx (leave blank for personal)"
                className="w-full rounded-xl border border-border bg-bg px-3.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3 flex items-end gap-2">
              <button
                type="submit"
                disabled={isSavingConfig}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-4 w-4" />
                <span>{isSavingConfig ? "Saving…" : "Save"}</span>
              </button>
              {dashboard.config.source === "db" && (
                <button
                  type="button"
                  disabled={isSavingConfig}
                  onClick={handleClearToken}
                  title="Remove stored token from database"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-bg px-3 py-2 text-sm text-muted hover:border-danger/40 hover:bg-danger-soft hover:text-danger cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Summary Metric Pills */}
      {dashboard.config.configured && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <button
            type="button"
            onClick={() => setSelectedState("all")}
            className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
              selectedState === "all"
                ? "border-accent bg-accent-soft/40"
                : "border-border bg-surface hover:border-accent/40"
            }`}
          >
            <div className="text-xs font-medium text-muted">
              Total Deployments
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-fg">
              {dashboard.counts.total}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedState((s) => (s === "READY" ? "all" : "READY"))
            }
            className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
              selectedState === "READY"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-border bg-surface hover:border-emerald-500/40"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Ready</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-fg">
              {dashboard.counts.ready}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedState((s) => (s === "BUILDING" ? "all" : "BUILDING"))
            }
            className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
              selectedState === "BUILDING"
                ? "border-amber-500 bg-amber-500/10"
                : "border-border bg-surface hover:border-amber-500/40"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Loader2
                className={`h-3.5 w-3.5 ${dashboard.counts.building > 0 ? "animate-spin" : ""}`}
              />
              <span>Building</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-fg">
              {dashboard.counts.building}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedState((s) => (s === "ERROR" ? "all" : "ERROR"))
            }
            className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
              selectedState === "ERROR"
                ? "border-danger bg-danger-soft"
                : "border-border bg-surface hover:border-danger/40"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
              <XCircle className="h-3.5 w-3.5" />
              <span>Failed</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-fg">
              {dashboard.counts.error}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedState((s) => (s === "QUEUED" ? "all" : "QUEUED"))
            }
            className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer col-span-2 sm:col-span-1 ${
              selectedState === "QUEUED"
                ? "border-blue-500 bg-blue-500/10"
                : "border-border bg-surface hover:border-blue-500/40"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Queued / Canceled</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-fg">
              {dashboard.counts.queued + dashboard.counts.canceled}
            </div>
          </button>
        </div>
      )}

      {/* Projects Overview Grid */}
      {dashboard.projects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent" />
              <span>Vercel Projects ({dashboard.projects.length})</span>
            </h2>
            {selectedProject !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedProject("all")}
                className="text-xs font-medium text-accent hover:underline cursor-pointer"
              >
                Show all projects
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.projects.map((proj) => {
              const latest =
                proj.latestDeployment ?? proj.latestProductionDeployment;
              const isSelected = selectedProject === proj.name;

              return (
                <div
                  key={proj.id}
                  onClick={() =>
                    setSelectedProject((prev) =>
                      prev === proj.name ? "all" : proj.name,
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedProject((prev) =>
                        prev === proj.name ? "all" : proj.name,
                      );
                    }
                  }}
                  className={`group rounded-2xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? "border-accent bg-accent-soft/25 shadow-xs"
                      : "border-border bg-surface hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm font-semibold text-fg">
                          {proj.name}
                        </span>
                        {proj.workspaceAppId && (
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent shrink-0">
                            Workspace App
                          </span>
                        )}
                      </div>
                      {proj.productionUrl ? (
                        <a
                          href={proj.productionUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-muted hover:text-accent"
                        >
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {proj.productionUrl.replace(/^https?:\/\//, "")}
                          </span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted">
                          No production domain
                        </p>
                      )}
                    </div>

                    {latest && (
                      <DeploymentStateBadge state={latest.state} size="sm" />
                    )}
                  </div>

                  {latest ? (
                    <div className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {latest.branch && (
                            <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg shrink-0">
                              <GitBranch className="h-3 w-3 text-muted" />
                              {latest.branch}
                            </span>
                          )}
                          {latest.commitSha && (
                            <span className="font-mono text-[11px] text-muted">
                              {latest.commitSha.slice(0, 7)}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] shrink-0">
                          {formatRelativeTime(latest.createdAt)}
                        </span>
                      </div>
                      {latest.commitMessage && (
                        <p className="truncate text-[11px] text-fg/80">
                          {latest.commitMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted">
                      No deployments found
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All Deployments Feed */}
      <section className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
        {/* Filter Bar */}
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              aria-label="Filter by project"
              className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg focus:border-accent focus:outline-none"
            >
              <option value="all">All Projects</option>
              {dashboard.projects.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Environment Target Filter */}
            <div className="inline-flex rounded-xl border border-border bg-bg p-0.5 text-xs">
              {(["all", "production", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTarget(t)}
                  className={`rounded-lg px-2.5 py-1 font-medium capitalize transition-colors cursor-pointer ${
                    selectedTarget === t
                      ? "bg-surface text-fg shadow-2xs"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <select
              value={selectedState}
              onChange={(e) =>
                setSelectedState(
                  e.target.value as "all" | VercelDeploymentState,
                )
              }
              aria-label="Filter by deployment state"
              className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg focus:border-accent focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="READY">Ready</option>
              <option value="BUILDING">Building</option>
              <option value="ERROR">Error</option>
              <option value="QUEUED">Queued</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative min-w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search branch, commit, SHA, project..."
              className="w-full rounded-xl border border-border bg-bg pl-8 pr-8 py-1.5 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Deployment List */}
        {!dashboard.config.configured ? (
          <div className="p-10 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Rocket className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-fg">
              Connect your Vercel Account
            </h3>
            <p className="mx-auto max-w-md text-xs text-muted">
              Add a Vercel Access Token above to monitor live builds, preview
              links, commit statuses, and build logs across{" "}
              <code className="font-mono text-fg">my_kaneki</code>,{" "}
              <code className="font-mono text-fg">my_finance</code>,{" "}
              <code className="font-mono text-fg">my_pm_agent</code>, and all
              your Vercel projects.
            </p>
          </div>
        ) : filteredDeployments.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            No deployments match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredDeployments.map((dep) => {
              const isRedeploying = redeployingId === dep.id;
              return (
                <div
                  key={dep.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-subtle/40 lg:flex-row lg:items-center lg:justify-between"
                >
                  {/* Left: Project + Target + Preview URL */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-fg">
                        {dep.name}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          dep.target === "production"
                            ? "bg-accent-soft text-accent"
                            : "bg-surface-subtle text-muted"
                        }`}
                      >
                        {dep.target}
                      </span>
                      <DeploymentStateBadge state={dep.state} size="sm" />
                      <span className="font-mono text-[11px] text-muted">
                        {formatDuration(dep.durationMs)}
                      </span>
                      <span className="text-[11px] text-muted">
                        · {formatRelativeTime(dep.createdAt)}
                      </span>
                    </div>

                    {/* Git Commit Info */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      {dep.branch && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
                          <GitBranch className="h-3 w-3 text-muted" />
                          <span>{dep.branch}</span>
                        </span>
                      )}
                      {dep.commitSha && (
                        dep.commitUrl ? (
                          <a
                            href={dep.commitUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
                          >
                            <GitCommitHorizontal className="h-3.5 w-3.5" />
                            <span>{dep.commitSha.slice(0, 7)}</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                            <GitCommitHorizontal className="h-3.5 w-3.5" />
                            <span>{dep.commitSha.slice(0, 7)}</span>
                          </span>
                        )
                      )}
                      {dep.commitMessage && (
                        <span className="truncate max-w-md text-fg/90">
                          {dep.commitMessage}
                        </span>
                      )}
                      {(dep.commitAuthor || dep.creator) && (
                        <span className="text-[11px] text-muted">
                          by {dep.commitAuthor || dep.creator}
                        </span>
                      )}
                    </div>

                    {/* Error Details if failed */}
                    {dep.state === "ERROR" &&
                      (dep.errorMessage || dep.errorCode) && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1 text-xs text-danger">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {dep.errorCode ? `[${dep.errorCode}] ` : ""}
                            {dep.errorMessage}
                          </span>
                        </div>
                      )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {dep.url && (
                      <a
                        href={dep.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/50 hover:text-accent"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Visit</span>
                        <ExternalLink className="h-3 w-3 text-muted" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => void openBuildLogs(dep)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/50 hover:text-accent cursor-pointer"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      <span>Build Logs</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRedeploying}
                      onClick={() => void handleRedeploy(dep)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/50 hover:text-accent disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw
                        className={`h-3.5 w-3.5 ${isRedeploying ? "animate-spin text-accent" : ""}`}
                      />
                      <span>{isRedeploying ? "Redeploying…" : "Redeploy"}</span>
                    </button>

                    {dep.inspectorUrl && (
                      <a
                        href={dep.inspectorUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Open in Vercel Dashboard"
                        className="inline-flex items-center gap-1 rounded-xl border border-border bg-bg px-2.5 py-1.5 text-xs text-muted hover:text-fg"
                      >
                        <span>Vercel</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Build Logs Modal */}
      {activeLogDeployment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setActiveLogDeployment(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Terminal className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-mono text-sm font-semibold text-fg">
                      {activeLogDeployment.name}
                    </h3>
                    <DeploymentStateBadge
                      state={activeLogDeployment.state}
                      size="sm"
                    />
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {activeLogDeployment.id} ·{" "}
                    {activeLogDeployment.branch || "detached"}{" "}
                    {activeLogDeployment.commitSha
                      ? `(${activeLogDeployment.commitSha.slice(0, 7)})`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openBuildLogs(activeLogDeployment)}
                  disabled={logsLoading}
                  title="Reload build logs"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin text-accent" : ""}`}
                  />
                  <span>Reload</span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyLogsToClipboard()}
                  disabled={filteredLogs.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle disabled:opacity-50 cursor-pointer"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLogDeployment(null)}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter logs bar */}
            <div className="border-b border-border bg-bg px-4 py-2 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter build output lines..."
                className="w-full bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
              />
              <span className="font-mono text-[11px] text-muted shrink-0">
                {filteredLogs.length} lines
              </span>
            </div>

            {/* Log Terminal Body */}
            <div className="flex-1 overflow-y-auto bg-neutral-950 p-4 font-mono text-xs text-neutral-200 space-y-1">
              {logsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading build logs from Vercel…</span>
                </div>
              ) : logsError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-400">
                  {logsError}
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-neutral-500">
                  No build log events returned for this deployment.
                </div>
              ) : (
                filteredLogs.map((evt) => (
                  <div
                    key={evt.id}
                    className={`flex items-start gap-3 leading-relaxed rounded px-1.5 py-0.5 ${
                      evt.level === "error"
                        ? "bg-red-500/15 text-red-300"
                        : evt.level === "warn"
                          ? "bg-amber-500/10 text-amber-300"
                          : "hover:bg-white/5"
                    }`}
                  >
                    <span className="select-none text-[10px] text-neutral-500 shrink-0 pt-0.5">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs flex-1">
                      {evt.text}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

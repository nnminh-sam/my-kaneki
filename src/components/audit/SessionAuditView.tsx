"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Filter,
  FolderKanban,
  Layers,
  Menu,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WrapText,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import type {
  SessionAuditCategory,
  SessionAuditEvent,
  SessionAuditListItem,
  SessionAuditResponse,
  SessionAuditSummary,
} from "@/lib/audit";

interface SessionAuditViewProps {
  initialData: SessionAuditResponse;
  initialSessionId?: string;
}

const CATEGORY_OPTIONS: Array<{
  id: SessionAuditCategory | "all";
  label: string;
}> = [
  { id: "all", label: "All Events" },
  { id: "llm_step", label: "AI Provider APIs" },
  { id: "workspace_tool", label: "Workspace Tools" },
  { id: "lms_tool", label: "LMS Tools" },
  { id: "mcp_api", label: "MCP APIs" },
  { id: "entity_mutation", label: "DB / GitHub Mutations" },
];

function formatRelativeTime(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatTimestamp(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function JsonInspectorBlock({
  title,
  data,
}: {
  title: string;
  data: unknown;
}) {
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);

  const formattedJson = useMemo(() => {
    if (typeof data === "string") {
      try {
        return JSON.stringify(JSON.parse(data), null, 2);
      } catch {
        return data;
      }
    }
    return JSON.stringify(data, null, 2);
  }, [data]);

  // Extract multi-line text fields (such as prompt or completion) so they are easy to read wrapped
  const highlightedText = useMemo(() => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.completion === "string" && obj.completion.trim()) {
      return { label: "Completion Text", text: obj.completion };
    }
    if (typeof obj.prompt === "string" && obj.prompt.trim()) {
      return { label: "Prompt Text", text: obj.prompt };
    }
    return null;
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-3 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-fg">{title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWrapLines((prev) => !prev)}
            title={wrapLines ? "Disable line wrapping" : "Wrap long lines"}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              wrapLines
                ? "bg-accent-soft text-accent"
                : "bg-surface-subtle text-muted hover:text-fg"
            }`}
          >
            <WrapText className="h-3 w-3" />
            <span>{wrapLines ? "Wrapped" : "No Wrap"}</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy JSON"
            className="inline-flex items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:text-fg cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-ok" />
                <span className="text-ok">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {highlightedText && (
        <div className="mb-2.5 rounded-md border border-border/60 bg-surface-subtle/60 p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {highlightedText.label}
          </div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs text-fg leading-relaxed">
            {highlightedText.text}
          </div>
        </div>
      )}

      <pre
        className={`max-h-80 overflow-y-auto rounded-md bg-surface-subtle/40 p-2.5 font-mono text-[11px] text-muted leading-relaxed ${
          wrapLines
            ? "whitespace-pre-wrap break-words overflow-x-hidden"
            : "whitespace-pre overflow-x-auto"
        }`}
      >
        {formattedJson}
      </pre>
    </div>
  );
}

function CategoryBadge({ category }: { category: SessionAuditCategory }) {
  switch (category) {
    case "workspace_tool":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
          <Wrench className="h-3 w-3" />
          <span>Workspace Tool</span>
        </span>
      );
    case "lms_tool":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
          <BookOpen className="h-3 w-3" />
          <span>LMS Tool</span>
        </span>
      );
    case "mcp_api":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft/60 px-2 py-0.5 text-[11px] font-medium text-accent">
          <FolderKanban className="h-3 w-3" />
          <span>MCP API</span>
        </span>
      );
    case "llm_step":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn-soft/50 px-2 py-0.5 text-[11px] font-medium text-fg">
          <Cpu className="h-3 w-3 text-warn" />
          <span>AI Provider API</span>
        </span>
      );
    case "entity_mutation":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-muted">
          <Database className="h-3 w-3 text-ok" />
          <span>Entity Mutation</span>
        </span>
      );
  }
}

export function SessionAuditView({
  initialData,
  initialSessionId = "all",
}: SessionAuditViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<SessionAuditResponse>(initialData);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId || "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<
    SessionAuditCategory | "all"
  >("all");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "success" | "error"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionFilterQuery, setSessionFilterQuery] = useState("");
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const fetchAuditLogs = useCallback(
    async (opts?: {
      sessionId?: string;
      category?: SessionAuditCategory | "all";
      status?: "all" | "success" | "error";
      search?: string;
    }) => {
      setIsRefreshing(true);
      try {
        const params = new URLSearchParams();
        const sid = opts?.sessionId ?? selectedSessionId;
        const cat = opts?.category ?? selectedCategory;
        const st = opts?.status ?? selectedStatus;
        const q = opts?.search ?? searchQuery;

        if (sid && sid !== "all") params.set("sessionId", sid);
        if (cat && cat !== "all") params.set("category", cat);
        if (st && st !== "all") params.set("status", st);
        if (q.trim()) params.set("search", q.trim());

        const res = await fetch(`/api/audit?${params.toString()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const next = (await res.json()) as SessionAuditResponse;
          setData(next);
        }
      } catch (err) {
        console.error("Failed to refresh session audit logs:", err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [selectedSessionId, selectedCategory, selectedStatus, searchQuery],
  );

  // Sync URL query param if navigated with ?sessionId=...
  useEffect(() => {
    const urlSessionId = searchParams.get("sessionId") || "all";
    if (urlSessionId !== selectedSessionId) {
      setSelectedSessionId(urlSessionId);
      void fetchAuditLogs({ sessionId: urlSessionId });
    }
  }, [searchParams, selectedSessionId, fetchAuditLogs]);

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setMobileSidebarOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (sessionId === "all") {
      params.delete("sessionId");
    } else {
      params.set("sessionId", sessionId);
    }
    const qs = params.toString();
    router.replace(qs ? `/audit?${qs}` : "/audit", { scroll: false });
    void fetchAuditLogs({ sessionId });
  };

  const handleCategoryChange = (cat: SessionAuditCategory | "all") => {
    setSelectedCategory(cat);
    void fetchAuditLogs({ category: cat });
  };

  const handleStatusChange = (st: "all" | "success" | "error") => {
    setSelectedStatus(st);
    void fetchAuditLogs({ status: st });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchAuditLogs({ search: searchQuery });
  };

  const toggleExpand = (id: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredSessions = useMemo(() => {
    if (!sessionFilterQuery.trim()) return data.sessions;
    const q = sessionFilterQuery.trim().toLowerCase();
    return data.sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [data.sessions, sessionFilterQuery]);

  const activeSession = useMemo(
    () => data.sessions.find((s) => s.id === selectedSessionId) ?? null,
    [data.sessions, selectedSessionId],
  );

  const summary: SessionAuditSummary = data.summary;

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-bg">
      {/* Mobile Sidebar Toggle */}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        title="Toggle session filter sidebar"
        className="absolute left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg shadow-xs md:hidden cursor-pointer"
      >
        {mobileSidebarOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <Menu className="h-4 w-4" />
        )}
      </button>

      {/* Left Session Filter Sidebar */}
      <CollapsibleSidebar
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Session Audit"
        description="Filter by conversation"
        ariaLabel="Session audit filter sidebar"
        expandOnHover
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      >
        {({ collapsed }) => (
          <>
            {/* All Sessions Option */}
            <div>
              <button
                type="button"
                onClick={() => handleSelectSession("all")}
                title="All Conversations"
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                  selectedSessionId === "all"
                    ? "bg-accent text-white shadow-xs"
                    : "text-muted hover:bg-surface-subtle hover:text-fg"
                } ${collapsed ? "md:justify-center" : ""}`}
              >
                <Layers className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="truncate">All Conversations</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        selectedSessionId === "all"
                          ? "bg-white/20 text-white"
                          : "bg-surface-subtle text-muted"
                      }`}
                    >
                      {data.sessions.length}
                    </span>
                  </div>
                )}
              </button>
            </div>

            {!collapsed && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
                  <input
                    type="text"
                    value={sessionFilterQuery}
                    onChange={(e) => setSessionFilterQuery(e.target.value)}
                    placeholder="Find session..."
                    className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-2.5 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-hidden"
                  />
                </div>

                <hr className="mx-1 border-t border-border" />

                <div className="space-y-1">
                  {filteredSessions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted">
                      No matching sessions.
                    </div>
                  ) : (
                    filteredSessions.map((s: SessionAuditListItem) => {
                      const isActive = s.id === selectedSessionId;
                      const relTime = formatRelativeTime(
                        s.updatedAt || s.createdAt,
                      );

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectSession(s.id)}
                          className={`group flex w-full flex-col gap-1 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                            isActive
                              ? "bg-accent-soft font-medium text-accent"
                              : "text-muted hover:bg-surface-subtle hover:text-fg"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 min-w-0">
                              <MessageSquare
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  isActive ? "text-accent" : "text-muted"
                                }`}
                              />
                              <span className="truncate font-medium text-fg">
                                {s.title || "New Chat"}
                              </span>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted">
                              {relTime}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pl-5 text-[10px]">
                            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">
                              {s.llmCallCount ?? 0} AI calls
                            </span>
                            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">
                              {s.toolCallCount} tools
                            </span>
                            {s.totalTokens > 0 && (
                              <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">
                                {s.totalTokens.toLocaleString()} tok
                              </span>
                            )}
                            {s.errorCount > 0 && (
                              <span className="rounded bg-danger-soft px-1.5 py-0.5 font-mono font-medium text-danger">
                                {s.errorCount} err
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CollapsibleSidebar>

      {/* Right Main Audit Inspector */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3.5 pl-14 md:pl-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
              <h1 className="truncate text-sm font-semibold text-fg">
                {activeSession
                  ? `Session Audit: ${activeSession.title}`
                  : "All Conversations — Agent API & Tool Audit Log"}
              </h1>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {activeSession
                ? `Session ID: ${activeSession.id} • ${activeSession.messageCount} messages`
                : "Inspect tool invocations, MCP API calls, LLM token telemetry, and DB/GitHub mutations per session"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeSession && (
              <Link
                href="/"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.setItem(
                      "my_kaneki_active_chat_id_v1",
                      activeSession.id,
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Open in Chat</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => void fetchAuditLogs()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/40 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-accent" : ""}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Telemetry & Optimization Summary Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>AI Provider API Calls</span>
                <Cpu className="h-4 w-4 text-warn" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-fg">
                  {summary.llmGenerations}
                </span>
                <span className="text-xs text-muted">
                  {summary.totalTokens.toLocaleString()} total tokens
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                Prompt:{" "}
                <span className="font-mono text-fg">
                  {summary.inputTokens.toLocaleString()}
                </span>{" "}
                • Completion:{" "}
                <span className="font-mono text-fg">
                  {summary.outputTokens.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Tool &amp; MCP API Calls</span>
                <Wrench className="h-4 w-4 text-accent" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-fg">
                  {summary.totalToolCalls}
                </span>
                <span className="text-xs text-muted">
                  {summary.mcpApiCalls} MCP •{" "}
                  {summary.totalToolCalls - summary.mcpApiCalls} internal
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                Avg execution latency:{" "}
                <span className="font-mono font-medium text-fg">
                  {formatDuration(
                    summary.avgToolDurationMs > 0
                      ? summary.avgToolDurationMs
                      : null,
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Downstream Mutations</span>
                <Database className="h-4 w-4 text-ok" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-fg">
                  {summary.entityMutations}
                </span>
                <span className="text-xs text-muted">DB &amp; GitHub commits</span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                Total cumulative time:{" "}
                <span className="font-mono font-medium text-fg">
                  {formatDuration(
                    summary.totalDurationMs > 0
                      ? summary.totalDurationMs
                      : null,
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Execution Reliability</span>
                <Activity className="h-4 w-4 text-accent" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-fg">
                  {summary.successRate}%
                </span>
                <span
                  className={`text-xs font-medium ${
                    summary.errorCount > 0 ? "text-danger" : "text-ok"
                  }`}
                >
                  {summary.errorCount > 0
                    ? `${summary.errorCount} failed`
                    : "0 errors"}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                {summary.successCount} succeeded of {summary.totalEvents} logged
                events
              </div>
            </div>
          </div>

          {/* Tool Optimization & Frequency Breakdown */}
          {summary.toolBreakdown.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span>API &amp; Tool Call Breakdown (Click to filter)</span>
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      void fetchAuditLogs({ search: "" });
                    }}
                    className="text-[11px] text-accent hover:underline cursor-pointer"
                  >
                    Clear tool filter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.toolBreakdown.map((tb) => {
                  const isFiltered = searchQuery === tb.toolName;
                  return (
                    <button
                      key={tb.toolName}
                      type="button"
                      onClick={() => {
                        const nextQ = isFiltered ? "" : tb.toolName;
                        setSearchQuery(nextQ);
                        void fetchAuditLogs({ search: nextQ });
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
                        isFiltered
                          ? "border-accent bg-accent-soft text-accent font-medium"
                          : "border-border bg-surface-subtle/60 text-fg hover:border-accent/40"
                      }`}
                    >
                      <span className="font-mono font-medium">
                        {tb.toolName}
                      </span>
                      <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {tb.count}x
                      </span>
                      {tb.avgDurationMs > 0 && (
                        <span className="font-mono text-[10px] text-muted">
                          {formatDuration(tb.avgDurationMs)}
                        </span>
                      )}
                      {tb.errorCount > 0 && (
                        <span className="rounded bg-danger-soft px-1 py-0.5 font-mono text-[10px] text-danger">
                          {tb.errorCount} err
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter & Search Controls */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleCategoryChange(opt.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    selectedCategory === opt.id
                      ? "bg-accent text-white shadow-2xs"
                      : "bg-surface-subtle text-muted hover:text-fg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter */}
              <div className="inline-flex items-center rounded-lg border border-border bg-surface-subtle p-0.5 text-xs">
                {(["all", "success", "error"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(st)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                      selectedStatus === st
                        ? "bg-surface text-fg shadow-2xs"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Search box */}
              <form
                onSubmit={handleSearchSubmit}
                className="relative flex items-center"
              >
                <Filter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tool, params, model..."
                  className="w-48 rounded-lg border border-border bg-bg py-1.5 pl-8 pr-7 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-hidden sm:w-60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      void fetchAuditLogs({ search: "" });
                    }}
                    className="absolute right-2 text-muted hover:text-fg cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Audit Events List */}
          <div className="space-y-2.5">
            {data.events.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-12 text-center">
                <ShieldCheck className="mb-3 h-10 w-10 text-muted/40" />
                <h3 className="text-sm font-semibold text-fg">
                  No audit events match your filter
                </h3>
                <p className="mt-1 max-w-md text-xs text-muted">
                  When the agent executes workspace tools, LMS tools, connected
                  MCP APIs, or LLM steps during a conversation, detailed
                  telemetry will appear here automatically.
                </p>
              </div>
            ) : (
              data.events.map((ev: SessionAuditEvent) => {
                const isExpanded = expandedEventIds.has(ev.id);
                const commitUrl =
                  (ev.output &&
                  typeof ev.output === "object" &&
                  "commitUrl" in (ev.output as Record<string, unknown>)
                    ? String((ev.output as Record<string, unknown>).commitUrl)
                    : null) || null;

                return (
                  <div
                    key={ev.id}
                    className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border/80"
                  >
                    {/* Event Summary Row */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(ev.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-surface-subtle/50 cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                        )}

                        <CategoryBadge category={ev.category} />

                        <span className="font-mono text-xs font-semibold text-fg">
                          {ev.toolName || ev.action}
                        </span>

                        {ev.model && (
                          <span className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
                            {ev.model}
                          </span>
                        )}

                        {ev.entityType !== "chat_session" && (
                          <span className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
                            {ev.entityType}:{ev.entityId}
                          </span>
                        )}

                        {selectedSessionId === "all" && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                ev.sessionId !== "unlinked" &&
                                ev.sessionId !== "anonymous"
                              ) {
                                handleSelectSession(ev.sessionId);
                              }
                            }}
                            title={`Filter by session: ${ev.sessionTitle}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-accent"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span className="max-w-40 truncate">
                              {ev.sessionTitle}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Right Telemetry Badges */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {ev.stepCount !== null && ev.stepCount > 0 && (
                          <span className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
                            {ev.stepCount}{" "}
                            {ev.stepCount === 1 ? "step" : "steps"}
                          </span>
                        )}

                        {ev.tokens && ev.tokens.total > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
                            <Zap className="h-3 w-3 text-warn" />
                            <span>
                              {ev.tokens.total.toLocaleString()} tok
                            </span>
                          </span>
                        )}

                        {ev.durationMs !== null && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
                            <Clock className="h-3 w-3" />
                            <span>{formatDuration(ev.durationMs)}</span>
                          </span>
                        )}

                        {ev.status === "error" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                            <AlertCircle className="h-3 w-3" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Succeeded</span>
                          </span>
                        )}

                        <span className="font-mono text-[11px] text-muted">
                          {formatTimestamp(ev.createdAt)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded Payload & Telemetry Inspector */}
                    {isExpanded && (
                      <div className="border-t border-border bg-surface-subtle/40 p-4 text-xs space-y-3">
                        {/* Metadata Strip */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                          <span>
                            <strong className="text-fg">Audit ID:</strong>{" "}
                            <code className="font-mono">{ev.id}</code>
                          </span>
                          <span>
                            <strong className="text-fg">Session ID:</strong>{" "}
                            <code className="font-mono">{ev.sessionId}</code>
                          </span>
                          <span>
                            <strong className="text-fg">Action:</strong>{" "}
                            <code className="font-mono">{ev.action}</code>
                          </span>
                          <span>
                            <strong className="text-fg">Actor:</strong>{" "}
                            <code className="font-mono">{ev.actor}</code>
                          </span>
                          {typeof ev.payload?.toolCallId === "string" && (
                            <span>
                              <strong className="text-fg">ToolCall ID:</strong>{" "}
                              <code className="font-mono">
                                {ev.payload.toolCallId}
                              </code>
                            </span>
                          )}
                          {commitUrl && (
                            <a
                              href={commitUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                            >
                              <span>View GitHub Commit</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>

                        {/* Error Box */}
                        {ev.error && (
                          <div className="rounded-lg border border-danger/30 bg-danger-soft/60 p-3 text-danger">
                            <div className="mb-1 font-semibold">
                              Error Message:
                            </div>
                            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                              {ev.error}
                            </pre>
                          </div>
                        )}

                        {/* LLM Step Telemetry Details */}
                        {ev.category === "llm_step" && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-lg border border-border bg-surface p-2.5">
                              <span className="text-[10px] text-muted block">
                                Provider &amp; Model
                              </span>
                              <span className="font-mono text-xs font-semibold text-fg">
                                {ev.model || "default"}
                              </span>
                            </div>
                            <div className="rounded-lg border border-border bg-surface p-2.5">
                              <span className="text-[10px] text-muted block">
                                Input / Output Tokens
                              </span>
                              <span className="font-mono text-xs font-semibold text-fg">
                                {(ev.tokens?.input ?? 0).toLocaleString()} /{" "}
                                {(ev.tokens?.output ?? 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="rounded-lg border border-border bg-surface p-2.5">
                              <span className="text-[10px] text-muted block">
                                Agent Steps &amp; Finish
                              </span>
                              <span className="font-mono text-xs font-semibold text-fg">
                                {ev.stepCount ?? 1} steps (
                                {String(ev.payload?.finishReason ?? "stop")})
                              </span>
                            </div>
                            <div className="rounded-lg border border-border bg-surface p-2.5">
                              <span className="text-[10px] text-muted block">
                                Tools Invoked in Turn
                              </span>
                              <span className="font-mono text-xs font-semibold text-fg">
                                {Array.isArray(ev.payload?.toolNames) &&
                                ev.payload.toolNames.length > 0
                                  ? ev.payload.toolNames.join(", ")
                                  : "None (text response)"}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Input & Output JSON Inspectors */}
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {ev.input !== null && (
                            <JsonInspectorBlock
                              title={
                                ev.category === "entity_mutation"
                                  ? "Before State / Input"
                                  : "API / Tool Input Parameters"
                              }
                              data={ev.input}
                            />
                          )}

                          {ev.output !== null && ev.output !== undefined && (
                            <JsonInspectorBlock
                              title={
                                ev.category === "entity_mutation"
                                  ? "After State / Committed Entity"
                                  : "API / Tool Response Output"
                              }
                              data={ev.output}
                            />
                          )}
                        </div>

                        {/* Fallback full payload when neither input nor output is structured */}
                        {ev.input === null &&
                          (ev.output === null || ev.output === undefined) &&
                          ev.category !== "llm_step" && (
                            <JsonInspectorBlock
                              title="Audit Payload"
                              data={ev.payload}
                            />
                          )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

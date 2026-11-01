"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCode,
  FileEdit,
  GitCommit,
  HelpCircle,
  Loader2,
  MessageSquareDiff,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import type { SourceRow, SubjectRow, ResearchDebateTurn } from "@/lib/lms/types";
import { resolveEscalationAction } from "@/actions/lms";

interface ResearchDebateViewProps {
  subject: SubjectRow;
  sources: SourceRow[];
}

function StatusBadge({ status }: { status: SourceRow["validation_status"] }) {
  switch (status) {
    case "validated":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok border border-ok/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Validated & Indexed
        </span>
      );
    case "escalated_to_user":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn border border-warn/30 animate-pulse">
          <AlertCircle className="h-3.5 w-3.5" />
          Escalated to User
        </span>
      );
    case "in_review":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent border border-accent/20">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          In Peer Review
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger border border-danger/20">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
        </span>
      );
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2.5 py-1 text-xs font-medium text-muted border border-border">
          Pending
        </span>
      );
  }
}

function DebateTurnCard({ turn }: { turn: ResearchDebateTurn }) {
  const isResearch = turn.actor === "research_agent";
  const isValidation = turn.actor === "validation_agent";
  const isUser = turn.actor === "user";

  const borderColor = isResearch
    ? "border-l-accent"
    : isValidation
    ? turn.action === "raise_issues"
      ? "border-l-danger"
      : "border-l-ok"
    : "border-l-fg";

  const iconColor = isResearch
    ? "text-accent"
    : isValidation
    ? turn.action === "raise_issues"
      ? "text-danger"
      : "text-ok"
    : "text-fg";

  return (
    <div className={`border-l-4 ${borderColor} bg-surface-subtle/50 rounded-r-xl p-4 space-y-2`}>
      <div className="flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1.5 font-semibold ${iconColor}`}>
          {isResearch ? (
            <Bot className="h-3.5 w-3.5" />
          ) : isValidation ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <User className="h-3.5 w-3.5" />
          )}
          <span>
            Round {turn.round} •{" "}
            {isResearch
              ? "Research Sub-Agent"
              : isValidation
              ? "Validation Sub-Agent"
              : "Learner (Human Decision)"}
          </span>
        </div>

        <span className="text-[11px] text-muted">
          {new Date(turn.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-fg">{turn.summary}</p>

      {/* Defects if raised */}
      {turn.defects && turn.defects.length > 0 && (
        <div className="mt-2 rounded-lg border border-danger/20 bg-danger-soft/40 p-2.5 text-xs text-danger">
          <span className="font-semibold">Defects Raised:</span>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {turn.defects.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Defense argument if provided */}
      {turn.defenseArgument && (
        <div className="mt-2 rounded-lg border border-ok/20 bg-ok-soft/40 p-2.5 text-xs text-ok">
          <span className="font-semibold">Defense & Revisions:</span>
          <p className="mt-0.5 leading-relaxed">{turn.defenseArgument}</p>
        </div>
      )}

      {/* Citations */}
      {turn.citations && turn.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {turn.citations.map((cite, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 font-mono text-[10px] text-muted border border-border"
            >
              [{i + 1}] {cite}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceDebateItem({
  source,
  subjectSlug,
}: {
  source: SourceRow;
  subjectSlug: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEscalated = source.validation_status === "escalated_to_user";

  const handleResolve = async (
    decision: "approve_override" | "edit_and_approve" | "reject",
  ) => {
    setActionPending(true);
    setError(null);
    try {
      const res = await resolveEscalationAction({
        sourceId: source.id,
        decision,
        editedMarkdown: decision === "edit_and_approve" ? editedText : undefined,
      });
      if (!res.ok) {
        setError(res.error || "Failed to resolve escalation.");
      } else {
        setIsEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision.");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-fg">
              {source.title || "Research Topic"}
            </h3>
            <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {source.perspective}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span>Round {source.review_round} / 3</span>
            {source.github_md_path && (
              <>
                <span>•</span>
                <code className="text-[11px] font-mono">{source.github_md_path}</code>
              </>
            )}
          </div>
        </div>

        <StatusBadge status={source.validation_status} />
      </div>

      {/* Escalation Action Panel */}
      {isEscalated && (
        <div className="rounded-xl border border-warn/40 bg-warn-soft/60 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <h4 className="text-xs font-bold text-fg">
                Human Review Escalation (3-Round Dispute)
              </h4>
              <p className="mt-0.5 text-xs text-muted">
                The research sub-agent and validation reviewer were unable to reach consensus after 3 rounds of peer review. Please review the debate arguments below and decide whether to accept, edit, or reject this material.
              </p>
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          {/* Edit text area if active */}
          {isEditing ? (
            <div className="space-y-2">
              <label htmlFor={`edit-markdown-${source.id}`} className="text-xs font-semibold text-fg">
                Edit Synthesized Markdown
              </label>
              <textarea
                id={`edit-markdown-${source.id}`}
                rows={6}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                placeholder="Make edits or corrections to the synthesized research..."
                className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg placeholder:text-muted focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/20"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={actionPending || !editedText.trim()}
                  onClick={() => handleResolve("edit_and_approve")}
                  className="inline-flex items-center gap-1 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-white hover:bg-ok/90 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {actionPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save Edits & Approve
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-fg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => handleResolve("approve_override")}
                className="inline-flex items-center gap-1 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-ok/90 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {actionPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Override & Accept
              </button>

              <button
                type="button"
                disabled={actionPending}
                onClick={() => {
                  setIsEditing(true);
                  setEditedText("");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle disabled:opacity-50 cursor-pointer transition-colors"
              >
                <FileEdit className="h-3 w-3" />
                Edit & Approve
              </button>

              <button
                type="button"
                disabled={actionPending}
                onClick={() => handleResolve("reject")}
                className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50 cursor-pointer transition-colors"
              >
                <XCircle className="h-3 w-3" />
                Reject Source
              </button>
            </div>
          )}
        </div>
      )}

      {/* Debate History Turns */}
      <div className="space-y-3">
        {source.debate_history && source.debate_history.length > 0 ? (
          source.debate_history.map((turn, idx) => (
            <DebateTurnCard key={idx} turn={turn} />
          ))
        ) : (
          <p className="text-xs text-muted italic">
            Debate history being initialized by research agents...
          </p>
        )}
      </div>

      {/* GitHub Commit & RAG status footer if validated */}
      {source.validation_status === "validated" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-subtle p-3 text-xs">
          <div className="flex items-center gap-2 text-muted">
            <GitCommit className="h-3.5 w-3.5 text-accent" />
            <span>Committed to Knowledge Repository</span>
          </div>

          <span className="inline-flex items-center gap-1 font-semibold text-ok">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Chunked & Vector Indexed
          </span>
        </div>
      )}
    </div>
  );
}

export function ResearchDebateView({
  subject,
  sources,
}: ResearchDebateViewProps) {
  const researchSources = sources.filter((s) => s.track === "agent_research");
  const escalatedCount = researchSources.filter(
    (s) => s.validation_status === "escalated_to_user",
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">
            Agent Research & 3-Round Debate
          </h1>
          <p className="text-xs text-muted">
            Track 2: Autonomous research sub-agents with strict peer-review defense and citation checks.
          </p>
        </div>

        {escalatedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-1.5 text-xs font-semibold text-warn">
            <AlertCircle className="h-4 w-4" />
            {escalatedCount} escalation{escalatedCount !== 1 ? "s" : ""} pending review
          </span>
        )}
      </div>

      {/* Sources list */}
      {researchSources.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center shadow-xs">
          <MessageSquareDiff className="mx-auto h-10 w-10 text-muted" />
          <h3 className="mt-3 text-sm font-semibold text-fg">
            No research debates active
          </h3>
          <p className="mt-1 text-xs text-muted">
            When research sub-agents explore web knowledge and synthesize modules, their defense debates appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {researchSources.map((source) => (
            <SourceDebateItem
              key={source.id}
              source={source}
              subjectSlug={subject.slug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

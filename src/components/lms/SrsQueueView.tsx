"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Sparkles,
} from "lucide-react";
import type { SubjectRow } from "@/lib/lms/types";
import type { DueReviewItem } from "@/lib/lms/review.service";

interface SrsQueueViewProps {
  subject: SubjectRow;
  dueReviews: DueReviewItem[];
  retentionRate: number | null;
  totalReviewsCompleted: number;
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function getDueBadge(nextReviewAtStr: string) {
  const next = new Date(nextReviewAtStr);
  const now = new Date();
  const diffDays = Math.ceil(
    (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger border border-danger/20">
        Overdue ({Math.abs(diffDays)}d)
      </span>
    );
  }
  if (diffDays === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger border border-danger/20">
        Due Today
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok border border-ok/20">
      Due in {diffDays}d
    </span>
  );
}

export function SrsQueueView({
  subject,
  dueReviews,
  retentionRate,
  totalReviewsCompleted,
}: SrsQueueViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPrompt = async (nodeId: string, nodeTitle: string) => {
    const prompt = `Generate a spaced repetition review quiz for module "${nodeTitle}" (ID: ${nodeId}) in subject "${subject.slug}".`;
    await navigator.clipboard.writeText(prompt);
    setCopiedId(nodeId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">
            Daily Spaced Repetition Queue
          </h1>
          <p className="text-xs text-muted">
            SM-2 memory schedule optimizing conceptual stability and long-term retention.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg">
            <CalendarCheck2 className="h-4 w-4 text-accent" />
            {dueReviews.length} review{dueReviews.length !== 1 ? "s" : ""} due
          </span>
        </div>
      </div>

      {/* Metrics Card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-muted">Estimated Retention</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {retentionRate != null ? `${retentionRate}%` : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {retentionRate != null && retentionRate >= 85
              ? "Optimal conceptual retention"
              : "Keep up with daily reviews"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-muted">Reviews Completed</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {totalReviewsCompleted}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            Total spaced repetition gates passed
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-muted">Active Queue Size</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {dueReviews.length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            Nodes currently requiring evaluation
          </div>
        </div>
      </div>

      {/* Reviews Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="border-b border-border bg-surface-subtle px-4 py-3 text-xs font-semibold text-fg">
          Spaced Repetition Schedule
        </div>

        {dueReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-ok" />
            <h3 className="mt-3 text-sm font-semibold text-fg">
              All caught up!
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted">
              You have no pending spaced repetition reviews for this subject today. Check back tomorrow!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-subtle/50 text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Concept Node</th>
                  <th className="px-4 py-3 font-semibold">Last Reviewed</th>
                  <th className="px-4 py-3 font-semibold">Interval</th>
                  <th className="px-4 py-3 font-semibold">Stability / EF</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dueReviews.map((item) => {
                  const nodeTitle = item.node?.title || `Node ${item.srs.node_id}`;
                  const ordinal = item.node?.ordinal
                    ? String(item.node.ordinal).padStart(2, "0") + ". "
                    : "";

                  return (
                    <tr key={item.srs.node_id} className="hover:bg-surface-subtle/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-fg">
                          {ordinal}
                          {nodeTitle}
                        </div>
                        {item.node?.summary && (
                          <div className="mt-0.5 max-w-xs truncate text-[11px] text-muted">
                            {item.node.summary}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">
                        {formatRelativeTime(item.srs.last_reviewed_at)}
                      </td>

                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">
                        {item.srs.interval_days} day{item.srs.interval_days !== 1 ? "s" : ""}
                      </td>

                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">
                        {Number(item.srs.stability || 2.5).toFixed(1)} EF
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {getDueBadge(item.srs.next_review_at)}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {item.pendingQuiz ? (
                          <Link
                            href={`/learning/${subject.slug}/quiz/${item.pendingQuiz.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
                          >
                            Start Quiz
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyPrompt(item.srs.node_id, nodeTitle)}
                              title="Copy prompt for agent to generate review quiz"
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-fg hover:bg-surface-subtle transition-colors cursor-pointer"
                            >
                              {copiedId === item.srs.node_id ? (
                                <>
                                  <Check className="h-3 w-3 text-ok" />
                                  <span className="text-ok">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 text-muted" />
                                  <span>Prompt Agent</span>
                                </>
                              )}
                            </button>

                            <Link
                              href="/"
                              title="Open Agent workspace"
                              className="inline-flex items-center rounded-lg bg-accent-soft p-1.5 text-accent hover:bg-accent hover:text-white transition-colors"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileUp,
  Menu,
} from "lucide-react";
import { getLmsTabs } from "./lms-nav-items";
import type { SubjectRow, NodeRow } from "@/lib/lms/types";
import type { SubjectOverview } from "@/lib/lms/subjects";

export interface LearningMobileTopNavProps {
  subjects: SubjectRow[];
  currentSubject: SubjectRow;
  overview: SubjectOverview;
  firstActiveNode: NodeRow | null;
  dueReviewsCount: number;
  escalationCount: number;
  activeQuizId?: string | null;
  onOpenSidebar: () => void;
}

export function LearningMobileTopNav({
  subjects,
  currentSubject,
  overview,
  firstActiveNode,
  dueReviewsCount,
  escalationCount,
  activeQuizId,
  onOpenSidebar,
}: LearningMobileTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const tabs = getLmsTabs({
    slug: currentSubject.slug,
    pathname,
    activeNodeId: firstActiveNode?.id,
    activeQuizId,
    dueReviewsCount,
    escalationCount,
  });

  const activeTab = tabs.find((t) => t.isActive) || tabs[0];
  const ActiveIcon = activeTab.icon;
  const hasPendingItems = dueReviewsCount > 0 || escalationCount > 0;

  return (
    <header className="border-b border-border bg-surface px-3 py-2.5 space-y-2">
      {/* Primary Row: Inner Sidebar Toggle + Subject Switcher + Ingest Notes + Continue */}
      <div className="flex items-center gap-2">
        {/* Inner Sidebar Drawer Toggle */}
        <button
          type="button"
          onClick={onOpenSidebar}
          title="Open study navigation & views"
          aria-label="Open study navigation & views"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-fg shadow-xs hover:bg-surface-subtle hover:border-accent/40 active:scale-95 transition-all cursor-pointer"
        >
          <Menu className="h-4 w-4" />
          {hasPendingItems && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
            </span>
          )}
        </button>

        {/* Subject Selector Dropdown */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <select
            aria-label="Select subject"
            value={currentSubject.slug}
            onChange={(e) => {
              const slug = e.target.value;
              if (slug && slug !== currentSubject.slug) {
                router.push(`/learning/${slug}`);
              }
            }}
            className="w-full appearance-none rounded-lg border border-border bg-bg py-1.5 pl-2.5 pr-7 text-xs font-semibold text-fg truncate hover:border-accent/40 focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent/20 cursor-pointer transition-colors"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
        </div>

        {/* Action: Ingest Notes */}
        <Link
          href={`/learning/${currentSubject.slug}/sources`}
          title="Ingest Notes & Sources"
          aria-label="Ingest Notes & Sources"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-muted hover:text-fg hover:border-accent/40 shadow-xs active:scale-95 transition-all cursor-pointer"
        >
          <FileUp className="h-3.5 w-3.5" />
        </Link>

        {/* Action: Continue Active Module */}
        {firstActiveNode ? (
          <Link
            href={`/learning/${currentSubject.slug}/module/${firstActiveNode.id}`}
            title={`Continue Node ${firstActiveNode.ordinal || 1}`}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 active:scale-95 transition-all cursor-pointer"
          >
            <span>Continue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            disabled
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface-subtle px-2.5 text-xs font-medium text-muted opacity-50 cursor-not-allowed"
          >
            <span>Continue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Secondary Row: Active Sub-Tab Context + Quick Metrics */}
      <div className="flex items-center justify-between gap-2 text-xs">
        {/* Active Sub-Tab Indicator (tap to open inner sidebar drawer) */}
        <button
          type="button"
          onClick={onOpenSidebar}
          title="Switch study view"
          className="flex min-w-0 max-w-[55%] items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:bg-accent/20 active:scale-95 transition-all cursor-pointer"
        >
          <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{activeTab.shortLabel}</span>
          <ChevronRight className="h-3 w-3 shrink-0 text-accent/60" />
        </button>

        {/* Essential Metrics: Progress & Retention */}
        <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-1.5 py-0.5 font-medium text-fg">
            <span className="text-muted">Progress:</span>
            <strong className="text-accent font-semibold">
              {overview.progressPercentage}%
            </strong>
          </span>

          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-1.5 py-0.5 font-medium text-fg">
            <span className="text-muted">Ret:</span>
            <strong
              className={`font-semibold ${
                overview.srs.retentionRate != null && overview.srs.retentionRate >= 80
                  ? "text-ok"
                  : overview.srs.retentionRate != null
                  ? "text-warn"
                  : "text-muted"
              }`}
            >
              {overview.srs.retentionRate != null
                ? `${overview.srs.retentionRate}%`
                : "—"}
            </strong>
          </span>
        </div>
      </div>
    </header>
  );
}

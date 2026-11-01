"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  FileUp,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import { getLmsTabs } from "./lms-nav-items";
import type {
  SubjectRow,
  LearnerProfileRow,
  NodeRow,
  PlacementSessionRow,
} from "@/lib/lms/types";
import type { SubjectOverview } from "@/lib/lms/subjects";

export interface LearningInnerSidebarProps {
  subjects: SubjectRow[];
  currentSubject: SubjectRow;
  profile: LearnerProfileRow | null;
  overview: SubjectOverview;
  firstActiveNode: NodeRow | null;
  placementSession: PlacementSessionRow | null;
  dueReviewsCount: number;
  escalationCount: number;
  activeQuizId?: string | null;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function LearningInnerSidebar({
  subjects,
  currentSubject,
  profile,
  overview,
  firstActiveNode,
  placementSession,
  dueReviewsCount,
  escalationCount,
  activeQuizId,
  mobileOpen,
  onMobileOpenChange,
}: LearningInnerSidebarProps) {
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

  // Extract learner style personas
  const learningStyle = profile?.learning_style || {};
  const personaBadges: string[] = [];
  if (typeof learningStyle === "object" && learningStyle !== null) {
    for (const [key, val] of Object.entries(learningStyle)) {
      if (typeof val === "string" && val.trim()) {
        personaBadges.push(val.trim());
      } else if (typeof val === "boolean" && val) {
        personaBadges.push(key.replace(/_/g, " "));
      }
    }
  }

  const isPlacementDone =
    placementSession?.status === "completed" ||
    currentSubject.entry_difficulty_level !== null;

  return (
    <CollapsibleSidebar
      mobileOnly
      icon={<BookOpen className="h-4 w-4" />}
      title="Learning"
      description={currentSubject.title}
      headerHref={`/learning/${currentSubject.slug}`}
      ariaLabel="Learning inner navigation sidebar"
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
      footer={({ closeMobile }) => (
        <div className="space-y-2">
          {firstActiveNode ? (
            <Link
              href={`/learning/${currentSubject.slug}/module/${firstActiveNode.id}`}
              onClick={closeMobile}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
            >
              Continue Node {String(firstActiveNode.ordinal || 1).padStart(2, "0")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}

          <Link
            href={`/learning/${currentSubject.slug}/sources`}
            onClick={closeMobile}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-fg hover:bg-surface-subtle transition-colors"
          >
            <FileUp className="h-3.5 w-3.5 text-muted" />
            Ingest Notes & Sources
          </Link>
        </div>
      )}
    >
      {({ closeMobile }) => (
        <div className="space-y-4">
          {/* Subject Switcher */}
          <div className="space-y-1.5">
            <label
              htmlFor="inner-sidebar-subject-select"
              className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
            >
              Subject
            </label>
            <div className="relative">
              <select
                id="inner-sidebar-subject-select"
                aria-label="Select subject"
                value={currentSubject.slug}
                onChange={(e) => {
                  const slug = e.target.value;
                  if (slug && slug !== currentSubject.slug) {
                    closeMobile();
                    router.push(`/learning/${slug}`);
                  }
                }}
                className="w-full appearance-none rounded-xl border border-border bg-bg py-2 pl-3 pr-8 text-xs font-semibold text-fg hover:border-accent/40 focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent/20 cursor-pointer transition-colors"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            </div>
          </div>

          <hr className="border-t border-border" />

          {/* Sub-Tabs (Study Views) */}
          <div className="space-y-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Study Views
            </p>
            <div className="space-y-1 pt-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    onClick={closeMobile}
                    className={`flex items-start justify-between gap-2.5 rounded-xl p-2.5 transition-colors ${
                      tab.isActive
                        ? "bg-accent text-white shadow-xs"
                        : "text-fg hover:bg-surface-subtle hover:text-fg"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          tab.isActive
                            ? "bg-white/20 text-white"
                            : "bg-surface-subtle text-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-semibold truncate ${
                            tab.isActive ? "text-white" : "text-fg"
                          }`}
                        >
                          {tab.label}
                        </p>
                        {tab.description && (
                          <p
                            className={`text-[11px] truncate ${
                              tab.isActive ? "text-white/80" : "text-muted"
                            }`}
                          >
                            {tab.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {tab.badge != null && (
                      <span
                        className={`shrink-0 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${
                          tab.isActive
                            ? "bg-white text-accent"
                            : tab.badgeVariant === "warn"
                            ? "bg-warn-soft text-warn border border-warn/30"
                            : "bg-accent-soft text-accent"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <hr className="border-t border-border" />

          {/* Subject Overview & Metrics Card */}
          <div className="rounded-xl border border-border bg-surface-subtle p-3 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Subject Overview
            </p>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Status:</span>
                <span className="capitalize font-semibold text-fg">
                  {currentSubject.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted">Scale:</span>
                <span className="font-semibold text-fg">
                  1..{currentSubject.difficulty_scale_n}
                </span>
              </div>

              {isPlacementDone && currentSubject.entry_difficulty_level !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Entry Tier:</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-accent">
                    <GraduationCap className="h-3 w-3" />
                    Tier {currentSubject.entry_difficulty_level}
                  </span>
                </div>
              )}

              {/* Progress bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Progress:</span>
                  <span className="font-semibold text-fg">
                    {overview.progressPercentage}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${overview.progressPercentage}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted text-right">
                  {overview.nodes.completed + overview.nodes.masteredByPlacement} /{" "}
                  {overview.nodes.total || 0} nodes
                </p>
              </div>

              {/* Retention */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-muted">Retention:</span>
                <span
                  className={`font-semibold ${
                    overview.srs.retentionRate != null &&
                    overview.srs.retentionRate >= 80
                      ? "text-ok"
                      : overview.srs.retentionRate != null
                      ? "text-warn"
                      : "text-muted"
                  }`}
                >
                  {overview.srs.retentionRate != null
                    ? `${overview.srs.retentionRate}%`
                    : "No reviews yet"}
                </span>
              </div>
            </div>

            {/* Persona Badges */}
            {personaBadges.length > 0 && (
              <div className="pt-2 border-t border-border/60">
                <p className="text-[10px] uppercase font-semibold text-muted mb-1.5">
                  Learning Personas
                </p>
                <div className="flex flex-wrap gap-1">
                  {personaBadges.map((badge, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </CollapsibleSidebar>
  );
}

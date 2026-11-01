"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  FileUp,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import type {
  SubjectRow,
  LearnerProfileRow,
  NodeRow,
  PlacementSessionRow,
} from "@/lib/lms/types";
import type { SubjectOverview } from "@/lib/lms/subjects";

interface SubjectHeaderProps {
  subjects: SubjectRow[];
  currentSubject: SubjectRow;
  profile: LearnerProfileRow | null;
  overview: SubjectOverview;
  firstActiveNode: NodeRow | null;
  placementSession: PlacementSessionRow | null;
}

export function SubjectHeader({
  subjects,
  currentSubject,
  profile,
  overview,
  firstActiveNode,
  placementSession,
}: SubjectHeaderProps) {
  const router = useRouter();

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    if (slug && slug !== currentSubject.slug) {
      router.push(`/learning/${slug}`);
    }
  };

  // Extract learner style personas (hidden if empty)
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
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Subject selector & title */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative inline-flex items-center">
              <select
                aria-label="Select subject"
                value={currentSubject.slug}
                onChange={handleSubjectChange}
                className="appearance-none rounded-lg border border-border bg-bg py-1.5 pl-3 pr-8 text-sm font-semibold text-fg hover:border-accent/40 focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/20 cursor-pointer transition-colors"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" />
            </div>

            {/* Persona badges from learner profile (hidden when empty) */}
            {personaBadges.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {personaBadges.map((badge, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent"
                  >
                    <Sparkles className="h-3 w-3" />
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Status: <strong className="capitalize text-fg">{currentSubject.status}</strong></span>
            <span>•</span>
            <span>Scale: <strong>1..{currentSubject.difficulty_scale_n}</strong></span>
          </div>
        </div>

        {/* Right: Metrics & actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Placement Tier Chip */}
          {isPlacementDone && currentSubject.entry_difficulty_level !== null ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs">
              <GraduationCap className="h-3.5 w-3.5 text-accent" />
              <span className="text-muted">Entry Tier:</span>
              <strong className="text-fg font-semibold">
                Tier {currentSubject.entry_difficulty_level}
              </strong>
            </div>
          ) : currentSubject.status === "placement" ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-1.5 text-xs text-warn">
              <GraduationCap className="h-3.5 w-3.5" />
              <span className="font-medium">Placement in progress</span>
            </div>
          ) : null}

          {/* Computed Progress Chip */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs">
            <span className="text-muted">Progress:</span>
            <strong className="font-semibold text-fg">
              {overview.progressPercentage}%
            </strong>
            <span className="text-[11px] text-muted">
              ({overview.nodes.completed + overview.nodes.masteredByPlacement}/
              {overview.nodes.total || 0} nodes)
            </span>
          </div>

          {/* Retention Chip */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs">
            <span className="text-muted">Retention:</span>
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
                : "No reviews yet"}
            </strong>
          </div>

          {/* Action: Ingest Notes */}
          <Link
            href={`/learning/${currentSubject.slug}/sources`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle hover:border-accent/40 focus:outline-hidden focus:ring-2 focus:ring-accent/20 cursor-pointer transition-colors"
          >
            <FileUp className="h-3.5 w-3.5 text-muted" />
            Ingest Notes
          </Link>

          {/* Action: Continue */}
          {firstActiveNode ? (
            <Link
              href={`/learning/${currentSubject.slug}/module/${firstActiveNode.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 focus:outline-hidden focus:ring-2 focus:ring-accent/30 cursor-pointer transition-colors"
            >
              Continue Node {String(firstActiveNode.ordinal || 1).padStart(2, "0")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-subtle px-3 py-1.5 text-xs font-medium text-muted cursor-not-allowed opacity-60"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

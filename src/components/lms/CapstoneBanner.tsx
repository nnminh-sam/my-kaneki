"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, ExternalLink, Flag, FolderGit2 } from "lucide-react";
import type { CapstoneProject, NodeRow } from "@/lib/lms/types";

interface CapstoneBannerProps {
  capstoneProject?: CapstoneProject | null;
  subjectSlug: string;
  nodes: NodeRow[];
  activeQuizId?: string | null;
}

export function CapstoneBanner({
  capstoneProject,
  subjectSlug,
  nodes,
  activeQuizId,
}: CapstoneBannerProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!capstoneProject || !capstoneProject.title) {
    return null;
  }

  const milestones = capstoneProject.milestones ?? [];
  const totalMilestones = milestones.length;

  // Calculate milestones completed based on node project_milestone and status
  const completedNodesWithMilestones = new Set(
    nodes
      .filter(
        (n) =>
          n.project_milestone &&
          (n.status === "completed" || n.status === "mastered_by_placement"),
      )
      .map((n) => n.project_milestone.trim().toLowerCase()),
  );

  let completedMilestonesCount = 0;
  for (const m of milestones) {
    if (completedNodesWithMilestones.has(m.title.trim().toLowerCase())) {
      completedMilestonesCount++;
    }
  }

  const pct =
    totalMilestones > 0
      ? Math.round((completedMilestonesCount / totalMilestones) * 100)
      : 0;

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-xs">
            <FolderGit2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Threaded Capstone Project
            </div>
            <h2 className="text-base font-bold text-fg">{capstoneProject.title}</h2>
            {capstoneProject.description && (
              <p className="mt-0.5 text-xs text-muted line-clamp-2">
                {capstoneProject.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
              <span>
                Milestone <strong>{completedMilestonesCount} / {totalMilestones}</strong> ready ({pct}%)
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalMilestones > 0 && (
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <span>{showDetails ? "Hide Spec" : "Inspect Spec"}</span>
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {activeQuizId && (
            <Link
              href={`/learning/${subjectSlug}/quiz/${activeQuizId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
            >
              Take Gate Quiz
            </Link>
          )}
        </div>
      </div>

      {/* Expanded Spec Details */}
      {showDetails && totalMilestones > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Project Milestones
          </h4>
          <div className="space-y-2">
            {milestones.map((m, idx) => {
              const isDone = completedNodesWithMilestones.has(
                m.title.trim().toLowerCase(),
              );
              return (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-lg bg-surface-subtle p-2.5 text-xs"
                >
                  {isDone ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  )}
                  <div>
                    <span className="font-semibold text-fg">
                      {idx + 1}. {m.title}
                    </span>
                    {m.description && (
                      <p className="mt-0.5 text-muted">{m.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

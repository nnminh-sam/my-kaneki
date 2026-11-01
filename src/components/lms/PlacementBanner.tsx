"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, HelpCircle, Loader2, Target } from "lucide-react";
import type { PlacementSessionRow, SubjectRow, NodeRow } from "@/lib/lms/types";
import { startPlacementAction } from "@/actions/lms";

interface PlacementBannerProps {
  subject: SubjectRow;
  placementSession: PlacementSessionRow | null;
  firstActiveNode: NodeRow | null;
  activePlacementQuizId?: string | null;
}

export function PlacementBanner({
  subject,
  placementSession,
  firstActiveNode,
  activePlacementQuizId,
}: PlacementBannerProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCompleted =
    placementSession?.status === "completed" ||
    (subject.entry_difficulty_level !== null && subject.status !== "placement");

  const isPlacementInProgress =
    subject.status === "placement" ||
    placementSession?.status === "in_progress";

  if (!isCompleted && !isPlacementInProgress) {
    return null;
  }

  const handleStartPlacement = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await startPlacementAction(subject.slug);
      if (!res.ok) {
        setError(res.error || "Failed to start placement session.");
      } else if (res.questionId) {
        router.push(`/learning/${subject.slug}/quiz/${res.questionId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start placement session.");
    } finally {
      setStarting(false);
    }
  };

  if (isCompleted) {
    const questionCount = placementSession?.history?.length ?? 1;
    const entryTier = subject.entry_difficulty_level ?? 1;

    return (
      <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-ok/30 bg-ok-soft p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ok text-white shadow-xs">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-fg">
              Binary Search Diagnostic Placement Complete
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Evaluated in {questionCount} question{questionCount !== 1 ? "s" : ""}.
              {entryTier > 1 ? ` Tiers 1–${entryTier - 1} auto-marked as Mastered.` : ""}{" "}
              Your active path starts at <strong className="text-fg font-semibold">Tier {entryTier}</strong>.
            </p>
          </div>
        </div>

        {firstActiveNode && (
          <Link
            href={`/learning/${subject.slug}/module/${firstActiveNode.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg shadow-xs hover:bg-surface-subtle transition-colors"
          >
            Resume Next Node
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  // In placement status
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-accent/30 bg-accent-soft p-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
          <Target className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-fg">
            Diagnostic Placement Assessment Available
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Take a quick adaptive assessment (≤ ⌈log₂ N⌉ questions) to personalize your curriculum entry tier and skip concepts you already know.
          </p>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      </div>

      {activePlacementQuizId ? (
        <Link
          href={`/learning/${subject.slug}/quiz/${activePlacementQuizId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
        >
          Resume Placement Quiz
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <button
          type="button"
          disabled={starting}
          onClick={handleStartPlacement}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 disabled:opacity-60 cursor-pointer transition-colors"
        >
          {starting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Initializing...
            </>
          ) : (
            <>
              Take Placement Quiz
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

import Link from "next/link";
import { Check, Clock, Flag, Lock } from "lucide-react";
import type { NodeRow, NodeStatus } from "@/lib/lms/types";

interface NodeCardProps {
  node: NodeRow;
  subjectSlug: string;
  prerequisiteNames: string[];
}

function StatusBadge({ status }: { status: NodeStatus }) {
  switch (status) {
    case "mastered_by_placement":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok border border-ok/20">
          <Check className="h-3 w-3" />
          Mastered by Placement
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok border border-ok/20">
          <Check className="h-3 w-3" />
          Completed
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent border border-accent/20">
          In Progress
        </span>
      );
    case "unlocked":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-fg border border-border">
          Unlocked
        </span>
      );
    case "locked":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-muted border border-border">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      );
  }
}

export function NodeCard({ node, subjectSlug, prerequisiteNames }: NodeCardProps) {
  const isLocked = node.status === "locked";
  const ordinalStr = String(node.ordinal || 1).padStart(2, "0");

  // Dynamic estimate based on difficulty level and content
  const estMinutes = 15 + Math.min(node.difficulty_level * 5, 30);

  const cardContent = (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all ${
        isLocked
          ? "border-border/60 bg-surface/50 opacity-65 cursor-not-allowed"
          : node.status === "in_progress"
          ? "border-accent bg-surface shadow-xs hover:border-accent hover:shadow-md cursor-pointer"
          : "border-border bg-surface hover:border-accent/40 hover:shadow-sm cursor-pointer"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
            {ordinalStr}. {node.title}
          </h3>
          <StatusBadge status={node.status} />
        </div>

        {node.summary && (
          <p className="mt-2 text-xs leading-relaxed text-muted line-clamp-3">
            {node.summary}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-[11px] text-muted">
        <div className="flex items-center gap-2">
          {node.project_milestone ? (
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              <Flag className="h-3 w-3" />
              {node.project_milestone}
            </span>
          ) : (
            <span>
              Prereq:{" "}
              {prerequisiteNames.length > 0
                ? prerequisiteNames.join(", ")
                : "None"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Est: ~{estMinutes} min</span>
        </div>
      </div>
    </div>
  );

  if (isLocked) {
    return <div aria-disabled="true">{cardContent}</div>;
  }

  return (
    <Link
      href={`/learning/${subjectSlug}/module/${node.id}`}
      className="block focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
    >
      {cardContent}
    </Link>
  );
}

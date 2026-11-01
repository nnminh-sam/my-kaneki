"use client";

import { useState } from "react";
import { Network, LayoutGrid, Layers } from "lucide-react";
import type { NodeRow, NodeEdgeRow } from "@/lib/lms/types";
import { MermaidDagViewer } from "./MermaidDagViewer";
import { DagTierSection } from "./DagTierSection";

interface LearningPathDagViewProps {
  nodes: NodeRow[];
  edges: NodeEdgeRow[];
  subjectSlug: string;
  sortedTiers: number[];
  tierMap: Map<number, NodeRow[]>;
  allNodesMap: Map<string, NodeRow>;
}

export function LearningPathDagView({
  nodes,
  edges,
  subjectSlug,
  sortedTiers,
  tierMap,
  allNodesMap,
}: LearningPathDagViewProps) {
  const [viewMode, setViewMode] = useState<"graph" | "both" | "cards">("both");

  return (
    <div className="space-y-6">
      {/* View Switcher Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Curriculum Architecture</h2>
          <p className="text-xs text-muted">
            {nodes.length} module{nodes.length !== 1 ? "s" : ""} across {sortedTiers.length} difficulty tier{sortedTiers.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-border bg-surface-subtle p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("both")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === "both"
                ? "bg-surface text-fg shadow-xs"
                : "text-muted hover:text-fg"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Combined</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("graph")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === "graph"
                ? "bg-surface text-fg shadow-xs"
                : "text-muted hover:text-fg"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Mermaid Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === "cards"
                ? "bg-surface text-fg shadow-xs"
                : "text-muted hover:text-fg"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Tier Cards</span>
          </button>
        </div>
      </div>

      {/* Mermaid Graph View (shown in 'graph' or 'both' mode) */}
      {(viewMode === "graph" || viewMode === "both") && (
        <MermaidDagViewer
          nodes={nodes}
          edges={edges}
          subjectSlug={subjectSlug}
        />
      )}

      {/* Tier Cards Grid (shown in 'cards' or 'both' mode) */}
      {(viewMode === "cards" || viewMode === "both") && (
        <div className="space-y-6">
          {sortedTiers.map((tier) => (
            <DagTierSection
              key={tier}
              tier={tier}
              nodes={tierMap.get(tier) ?? []}
              subjectSlug={subjectSlug}
              allNodesMap={allNodesMap}
              nodeEdges={edges}
            />
          ))}
        </div>
      )}
    </div>
  );
}

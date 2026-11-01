import type { NodeRow, NodeEdgeRow } from "@/lib/lms/types";
import { NodeCard } from "./NodeCard";

interface DagTierSectionProps {
  tier: number;
  nodes: NodeRow[];
  subjectSlug: string;
  allNodesMap: Map<string, NodeRow>;
  nodeEdges: NodeEdgeRow[];
}

export function DagTierSection({
  tier,
  nodes,
  subjectSlug,
  allNodesMap,
  nodeEdges,
}: DagTierSectionProps) {
  // Check if all nodes in this tier are completed or mastered
  const allMastered = nodes.every(
    (n) => n.status === "completed" || n.status === "mastered_by_placement",
  );
  const hasInProgress = nodes.some((n) => n.status === "in_progress");

  // Create dependency map for prereqs
  const prereqMap = new Map<string, string[]>();
  for (const edge of nodeEdges) {
    const list = prereqMap.get(edge.node_id) ?? [];
    const parentNode = allNodesMap.get(edge.depends_on_node_id);
    const parentLabel = parentNode
      ? String(parentNode.ordinal || 1).padStart(2, "0")
      : edge.depends_on_node_id;
    list.push(parentLabel);
    prereqMap.set(edge.node_id, list);
  }

  return (
    <section className="mb-8 last:mb-0">
      <div className="mb-3.5 flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${
              allMastered
                ? "bg-ok-soft text-ok border border-ok/20"
                : hasInProgress
                ? "bg-accent-soft text-accent border border-accent/20"
                : "bg-surface-subtle text-fg border border-border"
            }`}
          >
            Tier {tier}
          </span>
          <span className="text-xs font-medium text-muted">
            {nodes.length} module{nodes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="text-xs text-muted">
          {allMastered ? (
            <span className="text-ok font-medium">✓ Tier Mastered</span>
          ) : hasInProgress ? (
            <span className="text-accent font-medium">Active Stage</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            subjectSlug={subjectSlug}
            prerequisiteNames={prereqMap.get(node.id) ?? []}
          />
        ))}
      </div>
    </section>
  );
}

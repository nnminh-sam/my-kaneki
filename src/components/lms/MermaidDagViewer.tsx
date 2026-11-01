"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Network,
  ArrowDownUp,
  ArrowLeftRight,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  RotateCw,
} from "lucide-react";
import type { NodeRow, NodeEdgeRow } from "@/lib/lms/types";

interface MermaidDagViewerProps {
  nodes: NodeRow[];
  edges: NodeEdgeRow[];
  subjectSlug: string;
}

export function MermaidDagViewer({
  nodes,
  edges,
  subjectSlug,
}: MermaidDagViewerProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"TD" | "LR">("TD");
  const [zoom, setZoom] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const generateMermaidCode = () => {
    let code = `flowchart ${orientation}\n`;

    // Styling classes
    code += `  classDef unlocked fill:#1e1b4b,stroke:#818cf8,stroke-width:1.5px,color:#e0e7ff;\n`;
    code += `  classDef locked fill:#18181b,stroke:#3f3f46,stroke-width:1px,color:#71717a;\n`;
    code += `  classDef in_progress fill:#172554,stroke:#38bdf8,stroke-width:2px,color:#f0f9ff;\n`;
    code += `  classDef completed fill:#052e16,stroke:#34d399,stroke-width:1.5px,color:#ecfdf5;\n`;
    code += `  classDef mastered_by_placement fill:#052e16,stroke:#10b981,stroke-width:1.5px,color:#ecfdf5;\n`;

    for (const node of nodes) {
      const safeId = `node_${node.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const ordinal = String(node.ordinal || 1).padStart(2, "0");
      const safeTitle = node.title.replace(/["\\]/g, "");

      let badge = "Locked";
      if (node.status === "completed" || node.status === "mastered_by_placement") {
        badge = "Mastered";
      } else if (node.status === "in_progress") {
        badge = "In Progress";
      } else if (node.status === "unlocked") {
        badge = "Unlocked";
      }

      const label = `"${ordinal}. ${safeTitle}<br/>Tier ${node.difficulty_level} • ${badge}"`;
      code += `  ${safeId}[${label}]:::${node.status}\n`;
    }

    for (const edge of edges) {
      const fromId = `node_${edge.depends_on_node_id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const toId = `node_${edge.node_id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      code += `  ${fromId} --> ${toId}\n`;
    }

    return code;
  };

  useEffect(() => {
    let isMounted = true;

    async function renderGraph() {
      if (!containerRef.current || nodes.length === 0) return;
      setIsLoading(true);
      setRenderError(null);

      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            darkMode: true,
            background: "transparent",
            primaryColor: "#27272a",
            primaryBorderColor: "#6366f1",
            primaryTextColor: "#f4f4f5",
            lineColor: "#6366f1",
            fontSize: "12px",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          },
          flowchart: {
            curve: "basis",
            htmlLabels: true,
            padding: 12,
            nodeSpacing: 36,
            rankSpacing: 40,
          },
          securityLevel: "loose",
        });

        const code = generateMermaidCode();
        const renderId = `mermaid_inline_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, code);

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;

          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            // Read natural viewBox from Mermaid to constrain size accurately
            const viewBox = svgEl.getAttribute("viewBox");
            let naturalWidth = 360;
            if (viewBox) {
              const parts = viewBox.trim().split(/[\s,]+/).map(Number);
              if (parts.length === 4 && parts[2] > 0) {
                naturalWidth = parts[2];
              }
            }

            // Fixed, sensible sizing: width 100% up to natural width (never stretched to 1152px!)
            const targetMax =
              orientation === "TD"
                ? Math.min(Math.max(naturalWidth, 320), 480)
                : Math.min(Math.max(naturalWidth, 320), 780);

            svgEl.style.width = "100%";
            svgEl.style.maxWidth = `${targetMax}px`;
            svgEl.style.height = "auto";
            svgEl.style.display = "block";
            svgEl.style.margin = "0 auto";

            // Click listener on nodes
            for (const node of nodes) {
              const safeId = `node_${node.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
              const nodeG = svgEl.querySelector(`[id*="${safeId}"]`) as HTMLElement | null;
              if (nodeG) {
                if (node.status !== "locked") {
                  nodeG.style.cursor = "pointer";
                  nodeG.title = `Click to study ${node.title}`;
                  nodeG.onclick = () => {
                    router.push(`/learning/${subjectSlug}/module/${node.id}`);
                  };
                } else {
                  nodeG.style.cursor = "not-allowed";
                  nodeG.title = `Locked - complete prerequisites first`;
                }
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to render inline Mermaid DAG:", err);
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    renderGraph();

    return () => {
      isMounted = false;
    };
  }, [nodes, edges, orientation, subjectSlug, router]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.1, 1.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.6));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-fg">
              Curriculum Dependency Graph (DAG)
            </h3>
            <p className="text-[11px] text-muted">
              Interactive roadmap: click unlocked nodes to open modules
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Orientation Toggle */}
          <button
            type="button"
            onClick={() => setOrientation((prev) => (prev === "TD" ? "LR" : "TD"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-fg hover:bg-border/40 transition-colors"
            title={`Switch to ${orientation === "TD" ? "Left-to-Right" : "Top-Down"} flow`}
          >
            {orientation === "TD" ? (
              <>
                <ArrowDownUp className="h-3.5 w-3.5 text-accent" />
                <span>Top-Down</span>
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-3.5 w-3.5 text-accent" />
                <span>Left-Right</span>
              </>
            )}
          </button>

          {/* Inline Zoom Controls */}
          <div className="flex items-center rounded-lg border border-border bg-surface-subtle p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              className="rounded p-1 text-muted hover:text-fg hover:bg-border/30 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-1.5 text-[10px] font-mono font-medium text-fg hover:text-accent transition-colors"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="rounded p-1 text-muted hover:text-fg hover:bg-border/30 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          {/* Presentation Mode Button */}
          <a
            href={`/learning/${subjectSlug}/graph`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors shadow-xs"
            title="Open large detailed graph in new tab (Presentation Mode)"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Presentation Mode ↗</span>
          </a>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ok" />
          Mastered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          Unlocked / Active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted/40" />
          Locked
        </span>
      </div>

      {/* Render Area */}
      <div className="mt-4 relative min-h-[300px] max-h-[500px] overflow-auto rounded-lg border border-border/60 bg-surface-subtle/50 p-6 flex flex-col items-center">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-xs z-10">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <RotateCw className="h-4 w-4 animate-spin text-accent" />
              <span>Rendering DAG Graph...</span>
            </div>
          </div>
        )}

        {renderError ? (
          <div className="p-4 text-center text-xs text-danger">
            <p>Failed to render visual graph: {renderError}</p>
          </div>
        ) : (
          <div
            className="transition-transform duration-150 origin-top flex flex-col items-center w-full my-auto"
            style={{ transform: `scale(${zoom})` }}
          >
            <div
              ref={containerRef}
              className="w-full flex justify-center [&_svg]:cursor-default"
            />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  ArrowLeftRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowLeft,
  RotateCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { NodeRow, NodeEdgeRow, SubjectRow } from "@/lib/lms/types";

interface PresentationGraphViewProps {
  subject: SubjectRow;
  nodes: NodeRow[];
  edges: NodeEdgeRow[];
}

export function PresentationGraphView({
  subject,
  nodes,
  edges,
}: PresentationGraphViewProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"TD" | "LR">("TD");
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  const generateMermaidCode = () => {
    let code = `flowchart ${orientation}\n`;

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
            fontSize: "13px",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          },
          flowchart: {
            curve: "basis",
            htmlLabels: true,
            padding: 16,
            nodeSpacing: 45,
            rankSpacing: 50,
          },
          securityLevel: "loose",
        });

        const code = generateMermaidCode();
        const renderId = `mermaid_pres_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, code);

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;

          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            const viewBox = svgEl.getAttribute("viewBox");
            let naturalWidth = 360;
            if (viewBox) {
              const parts = viewBox.trim().split(/[\s,]+/).map(Number);
              if (parts.length === 4 && parts[2] > 0) {
                naturalWidth = parts[2];
              }
            }

            svgEl.style.width = "100%";
            svgEl.style.maxWidth = `${Math.max(naturalWidth, 340)}px`;
            svgEl.style.height = "auto";
            svgEl.style.display = "block";
            svgEl.style.margin = "0 auto";

            for (const node of nodes) {
              const safeId = `node_${node.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
              const nodeG = svgEl.querySelector(`[id*="${safeId}"]`) as HTMLElement | null;
              if (nodeG) {
                if (node.status !== "locked") {
                  nodeG.style.cursor = "pointer";
                  nodeG.title = `Click to study ${node.title}`;
                  nodeG.onclick = () => {
                    router.push(`/learning/${subject.slug}/module/${node.id}`);
                  };
                } else {
                  nodeG.style.cursor = "not-allowed";
                  nodeG.title = "Locked - complete prerequisites first";
                }
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to render presentation graph:", err);
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
  }, [nodes, edges, orientation, subject.slug, router]);

  const toggleFullscreen = () => {
    if (!rootRef.current) return;
    if (!document.fullscreenElement) {
      rootRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.4));
  const handleResetZoom = () => setZoom(1);

  return (
    <div
      ref={rootRef}
      className={`flex flex-col rounded-xl border border-border bg-surface overflow-hidden shadow-lg ${
        isFullscreen ? "h-screen w-screen rounded-none border-none" : "min-h-[580px] h-[calc(100vh-180px)]"
      }`}
    >
      {/* Presentation Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-subtle px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/learning/${subject.slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg hover:bg-border/40 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Link>

          <div className="h-4 w-px bg-border" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-fg">{subject.title}</h1>
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                Presentation Mode
              </span>
            </div>
            <p className="text-[11px] text-muted">
              {nodes.length} modules • Interactive dependency roadmap
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Orientation */}
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === "TD" ? "LR" : "TD"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-border/40 transition-colors"
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

          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              className="rounded p-1 text-muted hover:text-fg hover:bg-border/30 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 text-[11px] font-mono font-medium text-fg hover:text-accent transition-colors"
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="rounded p-1 text-muted hover:text-fg hover:bg-border/30 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetZoom}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted hover:text-fg transition-colors"
            title="Reset zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-border/40 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-accent" />
                <span>Exit</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-accent" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-auto bg-surface-subtle/30 p-8 flex flex-col items-center">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-xs z-10">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <RotateCw className="h-4 w-4 animate-spin text-accent" />
              <span>Rendering Full Architecture Graph...</span>
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
            <div ref={containerRef} className="w-full flex justify-center [&_svg]:cursor-default" />
          </div>
        )}

        {/* Floating Legend */}
        <div className="absolute bottom-4 left-6 flex items-center gap-4 rounded-xl border border-border/80 bg-surface/90 px-4 py-2 text-xs text-muted shadow-lg backdrop-blur-md z-10">
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
      </div>
    </div>
  );
}

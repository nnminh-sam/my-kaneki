"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderKanban,
  Loader2,
  Wrench,
} from "lucide-react";

interface ToolCallCardProps {
  toolName: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
}

export function ToolCallCard({
  toolName,
  state = "call",
  input = {},
  output,
  errorText,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = state === "call" || state === "input-streaming";
  const isFailed =
    state === "error" || output?.success === false || !!errorText;
  const isSuccess =
    !isFailed && (output?.success === true || state === "result");
  const errorMessage =
    (output?.error as string | undefined) ||
    errorText ||
    "Action failed to execute.";

  const title = input?.title as string | undefined;
  const path = input?.path as string | undefined;
  const commitUrl = output?.commitUrl as string | undefined;

  let toolIcon = <Wrench className="h-4 w-4 text-accent" />;
  let label = toolName;

  const isPmTool = /task|project|issue|ticket|pm|sprint/i.test(toolName);

  if (toolName === "addTodo") {
    toolIcon = <CheckSquare className="h-4 w-4 text-accent" />;
    label = "Add Todo";
  } else if (toolName === "updateNote") {
    toolIcon = <FileText className="h-4 w-4 text-accent" />;
    label = "Update Note";
  } else if (isPmTool) {
    toolIcon = <FolderKanban className="h-4 w-4 text-accent" />;
    label = toolName.replace(/^(my[-_]?pm)[-_:]?/i, "PM: ").replace(/_/g, " ");
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-subtle/80 p-3 text-xs transition-colors">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        title={expanded ? "Collapse tool call log" : "Expand tool call log"}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2 font-medium text-fg">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
          )}
          {toolIcon}
          <span>{label}</span>
          {path && (
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {path}
            </code>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isRunning && (
            <span className="flex items-center gap-1 text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Running...</span>
            </span>
          )}
          {!isRunning && isSuccess && (
            <span className="flex items-center gap-1 text-ok font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Succeeded</span>
            </span>
          )}
          {!isRunning && isFailed && (
            <span className="flex items-center gap-1 text-danger font-medium">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Failed</span>
            </span>
          )}
        </div>
      </button>

      {/* Tool inputs & outputs summary (collapsed by default) */}
      {expanded && (
        <div className="mt-2 text-fg/90">
          {toolName === "addTodo" && title && (
            <div className="flex items-start gap-1.5 text-xs">
              <span className="text-muted">Task:</span>
              <span className="font-medium text-fg">{title}</span>
            </div>
          )}

          {toolName === "updateNote" && (
            <div className="flex flex-col gap-1 text-xs">
              {commitUrl && (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <span>View GitHub Commit</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {toolName !== "addTodo" && toolName !== "updateNote" && (
            <div className="flex flex-col gap-1.5 text-xs">
              {Object.keys(input).length > 0 && (
                <div className="rounded bg-surface p-2 font-mono text-[11px] text-muted overflow-x-auto">
                  <span className="text-fg font-semibold not-mono block mb-1">
                    Parameters:
                  </span>
                  {JSON.stringify(input, null, 2)}
                </div>
              )}
              {output && !isFailed && (
                <div className="rounded bg-surface p-2 font-mono text-[11px] text-muted overflow-x-auto max-h-48">
                  <span className="text-fg font-semibold not-mono block mb-1">
                    Result:
                  </span>
                  {typeof output === "string"
                    ? output
                    : "content" in output &&
                        Array.isArray((output as any).content)
                      ? (output as any).content
                          .map((c: any) => c.text || JSON.stringify(c))
                          .join("\n")
                      : JSON.stringify(output, null, 2)}
                </div>
              )}
            </div>
          )}

          {isFailed && (
            <div className="mt-1.5 rounded bg-danger-soft/60 p-2 text-danger">
              <p className="font-mono text-[11px] leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, BookOpen, FileCode, Lock, ShieldAlert } from "lucide-react";
import type { NodeRow, SubjectRow } from "@/lib/lms/types";
import { MarkdownPreview } from "@/components/MarkdownPreview";

interface ModuleReaderProps {
  node: NodeRow;
  subject: SubjectRow;
  markdownContent: string | null;
  loadError?: string | null;
  gateQuizId?: string | null;
  nextUnlockedNodeId?: string | null;
}

export function ModuleReader({
  node,
  subject,
  markdownContent,
  loadError,
  gateQuizId,
  nextUnlockedNodeId,
}: ModuleReaderProps) {
  const ordinalStr = String(node.ordinal || 1).padStart(2, "0");
  const isLocked = node.status === "locked";
  const isCompleted = node.status === "completed" || node.status === "mastered_by_placement";

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header Bar */}
      <div className="border-b border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
              Module {ordinalStr} • Tier {node.difficulty_level}
            </span>
            <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[11px] capitalize text-muted">
              {node.status.replace(/_/g, " ")}
            </span>
          </div>

          {node.github_md_path && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <FileCode className="h-3.5 w-3.5 text-muted" />
              <code className="text-[11px] font-mono">{node.github_md_path}</code>
            </div>
          )}
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight text-fg">
          {ordinalStr}. {node.title}
        </h1>

        {node.summary && (
          <p className="mt-1 text-xs text-muted leading-relaxed">
            {node.summary}
          </p>
        )}
      </div>

      {/* Reader Content Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {markdownContent ? (
          <MarkdownPreview content={markdownContent} />
        ) : loadError ? (
          <div className="rounded-xl border border-warn/30 bg-warn-soft p-5 text-warn">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Study Guide Unpublished</h3>
                <p className="mt-1 text-xs leading-relaxed opacity-90">
                  {loadError}
                </p>
                <p className="mt-2 text-xs">
                  The AI Agent drafts module study guides during curriculum generation. You can ask your Socratic Tutor on the right to summarize key concepts for this module or generate the guide.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-xs text-muted">
            <BookOpen className="mr-2 h-4 w-4" />
            No content available for this module.
          </div>
        )}
      </div>

      {/* Bottom Mastery Gate Action Footer */}
      <div className="border-t border-border bg-surface-subtle p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-fg">
              {isCompleted
                ? "Module Mastered"
                : "Ready to test your understanding?"}
            </div>
            <div className="text-[11px] text-muted">
              {isCompleted
                ? "You have already demonstrated mastery of this module."
                : isLocked
                ? "This module is locked. Complete prerequisite modules first."
                : gateQuizId
                ? "Passing the Mastery Gate unlocks subsequent modules in your path."
                : "Mastery Gate quiz will be prepared once study material is published."}
            </div>
          </div>

          <div>
            {isLocked ? (
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-subtle border border-border px-4 py-2 text-xs font-medium text-muted cursor-not-allowed opacity-60"
              >
                <Lock className="h-3.5 w-3.5" />
                Locked
              </button>
            ) : gateQuizId ? (
              <Link
                href={`/learning/${subject.slug}/quiz/${gateQuizId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
              >
                Start Mastery Gate Quiz
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : isCompleted && nextUnlockedNodeId ? (
              <Link
                href={`/learning/${subject.slug}/module/${nextUnlockedNodeId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
              >
                Next Module
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button
                disabled
                title="Waiting for agent to generate mastery gate"
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-subtle border border-border px-4 py-2 text-xs font-medium text-muted cursor-not-allowed"
              >
                Quiz Pending Agent
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

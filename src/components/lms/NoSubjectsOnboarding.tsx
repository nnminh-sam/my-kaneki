import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Code2,
  Cpu,
  GraduationCap,
  Sparkles,
  Terminal,
} from "lucide-react";

export function NoSubjectsOnboarding() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-xs">
        {/* Header Icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-xs">
          <GraduationCap className="h-6 w-6" />
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-fg">
          Welcome to Kaneki Learning Management System
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your adaptive learning system creates DAG curriculums grounded in verified research and your own notes, evaluates mastery through polymorphic quizzes, and reinforces conceptual recall via spaced repetition.
        </p>

        {/* Getting Started Guide */}
        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold text-fg">How to get started:</h2>

          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <h3 className="text-xs font-semibold text-fg">
                  Option 1: Chat with your Kaneki Agent
                </h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  Head over to the Agent workspace and simply ask:
                </p>
                <div className="mt-2 rounded-lg bg-bg p-3 font-mono text-xs text-accent border border-border">
                  &quot;I want to learn Distributed Systems Consensus and Paxos&quot;
                </div>
                <div className="mt-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
                  >
                    Open Agent Chat
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <div className="flex items-start gap-3">
              <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              <div>
                <h3 className="text-xs font-semibold text-fg">
                  Option 2: Connect via MCP (Model Context Protocol)
                </h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  Connect your external AI IDE or CLI agent (Claude Desktop, Cursor, Antigravity) to the remote MCP server at:
                </p>
                <div className="mt-2 rounded-lg bg-bg p-3 font-mono text-xs text-muted border border-border">
                  POST /api/mcp
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  The MCP server exports tools across 5 groups: Subjects, Path & DAG Engine, Diagnostic Placement, Spaced Repetition, and Source Ingestion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

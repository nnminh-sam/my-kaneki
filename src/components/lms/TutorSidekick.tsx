"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Bot, Sparkles } from "lucide-react";
import { AgentChat } from "@/components/chat/AgentChat";
import type { ChatSession } from "@/lib/chat-sessions";
import { saveChatSessionToApi } from "@/lib/chat-sessions";
import type { SubjectRow, NodeRow } from "@/lib/lms/types";

interface TutorSidekickProps {
  subject: SubjectRow;
  node: NodeRow;
  initialSession: ChatSession;
}

export function TutorSidekick({
  subject,
  node,
  initialSession,
}: TutorSidekickProps) {
  const [session, setSession] = useState<ChatSession>(initialSession);

  const handleUpdateMessages = async (
    sessionId: string,
    updatedMessages: UIMessage[],
  ) => {
    setSession((prev) => ({
      ...prev,
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
    }));

    await saveChatSessionToApi({
      id: sessionId,
      title: session.title,
      messages: updatedMessages,
    });
  };

  const systemPreamble = `You are a dedicated Socratic Tutor assisting a learner in Kaneki LMS.
Current Subject: "${subject.title}" (slug: "${subject.slug}", scale: 1..${subject.difficulty_scale_n})
Current Module: "${node.title}" (id: "${node.id}", Tier ${node.difficulty_level}, summary: "${node.summary || "N/A"}")

Pedagogical guidelines:
1. Guide the learner with Socratic inquiry and clear technical analogies.
2. Ground your answers in the subject's curriculum and verified RAG sources.
3. Be concise and encourage deep conceptual understanding.
4. When the learner demonstrates mastery, asks to mark a node completed/done, or concludes the module, call lmsUpdateNodeStatus with nodeId "${node.id}", subjectSlug "${subject.slug}", and status "completed". Never claim a node was marked done without calling the tool.`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      {/* Sidekick Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-fg">Socratic Tutor</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              <span>Grounded in module material</span>
            </div>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
          <Sparkles className="h-3 w-3" />
          RAG Active
        </span>
      </div>

      {/* Embedded Scoped AgentChat */}
      <div className="flex-1 overflow-hidden min-h-0">
        <AgentChat
          session={session}
          onUpdateSessionMessages={handleUpdateMessages}
          systemPreamble={systemPreamble}
          headerTitle={`Tutor: ${node.title}`}
          headerBadge="LMS Tutor"
          placeholder={`Ask about ${node.title}, request an analogy, or clarify a concept...`}
        />
      </div>
    </div>
  );
}

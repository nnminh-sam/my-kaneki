"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  CheckSquare,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import type { ChatSession } from "@/lib/chat-sessions";
import { ChatMessage } from "./ChatMessage";
import { OllamaUsageModal } from "./OllamaUsageModal";

interface AgentChatProps {
  session: ChatSession;
  onUpdateSessionMessages: (sessionId: string, messages: UIMessage[]) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    icon: <CheckSquare className="h-4 w-4 text-accent" />,
    label: "Add task",
    prompt: "Add a todo: Review pull requests and organize technical docs",
  },
  {
    icon: <FileText className="h-4 w-4 text-accent" />,
    label: "Update note",
    prompt: "Update note notes/daily-log.md with a summary of today's learning and workspace tasks",
  },
  {
    icon: <Sparkles className="h-4 w-4 text-accent" />,
    label: "Workspace capabilities",
    prompt: "What tools and actions do you have access to in this workspace?",
  },
];

export function AgentChat({ session, onUpdateSessionMessages }: AgentChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const latestMessagesRef = useRef<UIMessage[]>(session.messages);
  const onUpdateRef = useRef(onUpdateSessionMessages);

  useEffect(() => {
    onUpdateRef.current = onUpdateSessionMessages;
  }, [onUpdateSessionMessages]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: session.id,
    messages: session.messages,
    onFinish: ({ messages: updatedMessages }) => {
      latestMessagesRef.current = updatedMessages;
      onUpdateRef.current(session.id, updatedMessages);
    },
    onError: () => {
      if (latestMessagesRef.current.length > 0) {
        onUpdateRef.current(session.id, latestMessagesRef.current);
      }
    },
  });

  const isGenerating = status === "submitted" || status === "streaming";

  // Track latest messages in ref without triggering state updates
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  // Auto-scroll when new messages or chunks arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Save latest messages on unmount
  useEffect(() => {
    const currentSessionId = session.id;
    return () => {
      if (latestMessagesRef.current.length > 0) {
        onUpdateRef.current(currentSessionId, latestMessagesRef.current);
      }
    };
  }, [session.id]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isGenerating) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage({ text });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-fg">{session.title || "New Chat"}</h1>
            <p className="text-[11px] text-muted flex items-center gap-1.5">
              <span>Ollama Cloud Agent</span>
              <span>•</span>
              <span className="text-ok flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                Active
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <OllamaUsageModal />
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px]">
            <ShieldCheck className="h-3 w-3 text-ok" />
            Audit Logging Active
          </span>
        </div>
      </div>

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent ring-8 ring-accent-soft/50 shadow-sm">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-fg">Kaneki Workspace Agent</h2>
            <p className="mt-1 max-w-md text-xs text-muted leading-relaxed">
              Equipped with resilient tool execution and a polymorphic, append-only audit log.
              Ask me to manage your todos or update your GitHub notes.
            </p>

            {/* Quick Suggestions */}
            <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-3">
              {PROMPT_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(sug.prompt)}
                  className="flex flex-col items-start rounded-xl border border-border bg-surface p-3 text-left transition-all hover:border-accent/40 hover:bg-surface-subtle hover:shadow-xs active:scale-[0.98] cursor-pointer"
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg">
                    {sug.icon}
                    <span>{sug.label}</span>
                  </div>
                  <span className="line-clamp-2 text-[11px] text-muted leading-relaxed">
                    {sug.prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col py-4">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}

            {isGenerating && (
              <div className="flex items-center gap-2 px-6 py-3 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                <span>Thinking & executing tools...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-xs text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error.message || "Failed to stream agent response."}</span>
        </div>
      )}

      {/* Bottom Input Box */}
      <div className="border-t border-border bg-surface p-4">
        <div className="mx-auto max-w-3xl">
          <div className="relative flex items-end rounded-xl border border-border bg-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask Kaneki Agent to add todos, edit GitHub notes, or plan your day..."
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-muted focus:outline-hidden leading-relaxed"
            />

            <div className="ml-2 flex items-center gap-1">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={() => {
                    stop();
                    if (latestMessagesRef.current.length > 0) {
                      onUpdateRef.current(session.id, latestMessagesRef.current);
                    }
                  }}
                  title="Stop generating"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  title="Send message (Enter)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span className="hidden sm:inline">Actions logged to audit_log</span>
          </div>
        </div>
      </div>
    </div>
  );
}

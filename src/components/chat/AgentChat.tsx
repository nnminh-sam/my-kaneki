"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  Check,
  CheckSquare,
  FileText,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { ChatSession } from "@/lib/chat-sessions";
import { ChatMessage } from "./ChatMessage";

interface AgentChatProps {
  session: ChatSession;
  onUpdateSessionMessages: (sessionId: string, messages: UIMessage[]) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
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
    prompt:
      "Update note notes/daily-log.md with a summary of today's learning and workspace tasks",
  },
  {
    icon: <Sparkles className="h-4 w-4 text-accent" />,
    label: "Workspace capabilities",
    prompt: "What tools and actions do you have access to in this workspace?",
  },
];

export function AgentChat({
  session,
  onUpdateSessionMessages,
  onRenameSession,
}: AgentChatProps) {
  const [input, setInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(session.title || "New Chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitleInput(session.title || "New Chat");
    setIsEditingTitle(false);
  }, [session.id, session.title]);

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && onRenameSession) {
      onRenameSession(session.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  const latestMessagesRef = useRef<UIMessage[]>(session.messages);
  const onUpdateRef = useRef(onUpdateSessionMessages);

  useEffect(() => {
    onUpdateRef.current = onUpdateSessionMessages;
  }, [onUpdateSessionMessages]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: session.id,
    messages: session.messages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId: session.id },
    }),
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
      <div className="hidden h-15 shrink-0 items-center justify-between border-b border-border bg-surface px-6 md:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5 py-0.5">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                  className="rounded border border-accent bg-bg px-1.5 py-0.5 text-xs font-semibold text-fg outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  title="Save title"
                  className="p-1 rounded text-ok hover:bg-ok-soft cursor-pointer transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  title="Cancel"
                  className="p-1 rounded text-muted hover:text-fg hover:bg-surface-subtle cursor-pointer transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/header-title">
                <h1 className="text-sm font-semibold text-fg">
                  {session.title || "New Chat"}
                </h1>
                {onRenameSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleInput(session.title || "New Chat");
                      setIsEditingTitle(true);
                    }}
                    title="Rename chat"
                    className="opacity-0 group-hover/header-title:opacity-100 text-muted hover:text-accent p-0.5 rounded transition-opacity cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px]">
            <ShieldCheck className="h-3 w-3 text-ok" />
            Audit Logging Active
          </span>
        </div>
      </div>

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto pt-12 md:pt-0">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent ring-8 ring-accent-soft/50 shadow-sm">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-fg">
              Kaneki Workspace Agent
            </h2>
            <p className="mt-1 max-w-md text-xs text-muted leading-relaxed">
              Equipped with resilient tool execution and a polymorphic,
              append-only audit log. Ask me to manage your todos or update your
              GitHub notes.
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
          <span className="flex-1">
            {error.message || "Failed to stream agent response."}
          </span>
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
                      onUpdateRef.current(
                        session.id,
                        latestMessagesRef.current,
                      );
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
            <span className="hidden sm:inline">
              Actions logged to audit_log
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

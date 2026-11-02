"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  Check,
  CheckSquare,
  Copy,
  FileText,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { ChatSession } from "@/lib/chat-sessions";
import { fetchSessionMessages } from "@/lib/chat-sessions";
import { ActionModal } from "@/components/ActionModal";
import { ChatMessage, type ChatMessageActionProps } from "./ChatMessage";
import { AgentChatInput } from "./AgentChatInput";

export type { ChatMessageActionProps };

interface AgentChatProps {
  session: ChatSession;
  onUpdateSessionMessages: (sessionId: string, messages: UIMessage[]) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  systemPreamble?: string;
  headerTitle?: string;
  headerBadge?: string;
  placeholder?: string;
  renderMessageActions?: (props: ChatMessageActionProps) => React.ReactNode;
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
  systemPreamble,
  headerTitle,
  headerBadge,
  placeholder = "Ask a question, update notes, or manage tasks...",
  renderMessageActions,
}: AgentChatProps) {
  const PAGE_SIZE = 25;

  const [activeModel, setActiveModel] = useState<{
    provider: string;
    model: string;
  } | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(session.title || "New Chat");
  const [copiedId, setCopiedId] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // Pagination state: start with the latest PAGE_SIZE messages
  const initialMessages = useMemo(() => {
    const all = session.messages || [];
    if (all.length <= PAGE_SIZE) return all;
    return all.slice(all.length - PAGE_SIZE);
  }, [session.messages]);

  const [hasMore, setHasMore] = useState(session.messages.length > PAGE_SIZE);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  useEffect(() => {
    setTitleInput(session.title || "New Chat");
    setIsEditingTitle(false);
    setCopiedId(false);
  }, [session.id, session.title]);

  // Check if there are older messages available on backend
  useEffect(() => {
    let isMounted = true;
    const hasLocalMore = session.messages.length > PAGE_SIZE;
    if (hasLocalMore) {
      setHasMore(true);
      return;
    }

    const oldestId = session.messages[0]?.id;
    if (oldestId) {
      void fetchSessionMessages(session.id, { limit: 1, before: oldestId }).then(
        (res) => {
          if (isMounted) {
            setHasMore(res.hasMore || res.messages.length > 0);
          }
        },
      );
    } else {
      setHasMore(false);
    }

    return () => {
      isMounted = false;
    };
  }, [session.id, session.messages]);

  const handleCopySessionId = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(session.id);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = session.id;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error("Failed to copy conversation ID:", err);
    }
  };

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && onRenameSession) {
      onRenameSession(session.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  const latestMessagesRef = useRef<UIMessage[]>(initialMessages);
  const onUpdateRef = useRef(onUpdateSessionMessages);

  useEffect(() => {
    onUpdateRef.current = onUpdateSessionMessages;
  }, [onUpdateSessionMessages]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { sessionId: session.id, ...(systemPreamble ? { systemPreamble } : {}) },
      }),
    [session.id, systemPreamble],
  );

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    id: session.id,
    messages: initialMessages,
    transport,
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

  const [dismissedError, setDismissedError] = useState<Error | null>(null);

  const isGenerating = status === "submitted" || status === "streaming";

  // Track latest messages in ref without triggering state updates
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  // Load older messages lazily when requested or scrolling to top
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingOlder || !hasMore) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    setIsLoadingOlder(true);
    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    try {
      const oldestMessageId = latestMessagesRef.current[0]?.id;
      if (!oldestMessageId) {
        setHasMore(false);
        return;
      }

      const res = await fetchSessionMessages(session.id, {
        limit: PAGE_SIZE,
        before: oldestMessageId,
      });

      if (res.messages.length > 0) {
        setMessages((current) => {
          const existingIds = new Set(current.map((m) => m.id));
          const newOlder = res.messages.filter((m) => !existingIds.has(m.id));
          if (newOlder.length === 0) return current;
          return [...newOlder, ...current];
        });

        setHasMore(res.hasMore);

        // Adjust scroll position after prepended elements render to prevent jumps
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            const newScrollHeight = messagesContainerRef.current.scrollHeight;
            const diff = newScrollHeight - oldScrollHeight;
            messagesContainerRef.current.scrollTop = oldScrollTop + diff;
          }
        });
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [hasMore, isLoadingOlder, session.id, setMessages]);

  // IntersectionObserver for lazy loading older messages when top sentinel is visible
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = messagesContainerRef.current;
    if (!sentinel || !container || !hasMore || isLoadingOlder) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadOlderMessages();
        }
      },
      {
        root: container,
        rootMargin: "150px 0px 0px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingOlder, loadOlderMessages]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingOlder || !hasMore) return;
    if (container.scrollTop < 120) {
      void loadOlderMessages();
    }
  }, [hasMore, isLoadingOlder, loadOlderMessages]);

  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);

  // Auto-scroll messages container internally without scrolling page or parent layout
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const currentFirstId = messages[0]?.id ?? null;
    const currentLastId = messages[messages.length - 1]?.id ?? null;

    // Detect if older messages were prepended to the top
    const wasPrepended =
      prevFirstMessageIdRef.current !== null &&
      currentFirstId !== prevFirstMessageIdRef.current &&
      prevLastMessageIdRef.current === currentLastId;

    prevFirstMessageIdRef.current = currentFirstId;
    const prevLastId = prevLastMessageIdRef.current;
    prevLastMessageIdRef.current = currentLastId;

    if (wasPrepended) {
      // Do not auto-scroll down when older messages are loaded into the top
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isGenerating || isNearBottom || prevLastId !== currentLastId) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Ensure window and parent containers stay at top 0 on initial session load
  useEffect(() => {
    prevFirstMessageIdRef.current = null;
    prevLastMessageIdRef.current = null;
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
    const timer = setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [session.id]);

  // Save latest messages on unmount
  useEffect(() => {
    const currentSessionId = session.id;
    return () => {
      if (latestMessagesRef.current.length > 0) {
        onUpdateRef.current(currentSessionId, latestMessagesRef.current);
      }
    };
  }, [session.id]);

  const activeModelRef = useRef(activeModel);
  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  const handleSend = useCallback(
    async (textToSend: string) => {
      const text = textToSend.trim();
      if (!text || isGenerating) return;

      try {
        await sendMessage(
          { text },
          {
            body: {
              sessionId: session.id,
              ...(systemPreamble ? { systemPreamble } : {}),
              ...(activeModelRef.current
                ? {
                    provider: activeModelRef.current.provider,
                    model: activeModelRef.current.model,
                  }
                : {}),
            },
          },
        );
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [isGenerating, sendMessage, session.id, systemPreamble],
  );

  const handleStop = useCallback(() => {
    stop();
    if (latestMessagesRef.current.length > 0) {
      onUpdateRef.current(session.id, latestMessagesRef.current);
    }
  }, [session.id, stop]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg">
      {/* Top Header */}
      <div className="hidden h-15 shrink-0 items-center justify-between border-b border-border bg-surface px-6 md:flex">
        <div className="flex items-center gap-2.5 min-w-0 mr-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
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
              <div className="flex items-center gap-1.5 group/header-title min-w-0">
                <h1 className="truncate text-sm font-semibold text-fg">
                  {headerTitle ?? session.title ?? "New Chat"}
                </h1>
                {onRenameSession && !headerTitle && (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleInput(session.title || "New Chat");
                      setIsEditingTitle(true);
                    }}
                    title="Rename chat"
                    className="opacity-0 group-hover/header-title:opacity-100 text-muted hover:text-accent p-0.5 rounded transition-opacity cursor-pointer shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted shrink-0">
          <button
            type="button"
            onClick={handleCopySessionId}
            title={`Copy conversation ID: ${session.id}`}
            aria-label="Copy conversation ID"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-fg cursor-pointer"
          >
            {copiedId ? (
              <>
                <Check className="h-3 w-3 text-ok" />
                <span className="text-ok">Copied ID</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy ID</span>
              </>
            )}
          </button>

          {headerBadge ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-medium text-fg">
              {headerBadge}
            </span>
          ) : (
            <Link
              href={`/audit?sessionId=${encodeURIComponent(session.id)}`}
              title="Inspect API & tool call audit log for this session"
              className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] transition-colors hover:border-accent/40 hover:text-fg"
            >
              <ShieldCheck className="h-3 w-3 text-ok" />
              <span>Audit Logging Active</span>
            </Link>
          )}
        </div>
      </div>

      {/* Messages Stream Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto pt-12 md:pt-0"
      >
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
            {/* Top Pagination Sentinel & Controls */}
            <div ref={topSentinelRef} className="w-full px-4">
              {isLoadingOlder && (
                <div className="flex items-center justify-center py-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent mr-2" />
                  <span>Loading older messages...</span>
                </div>
              )}
              {!isLoadingOlder && hasMore && (
                <div className="flex justify-center py-1">
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    className="rounded-md border border-border bg-surface-subtle px-3 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg cursor-pointer"
                  >
                    Load older messages
                  </button>
                </div>
              )}
              {!hasMore && messages.length >= PAGE_SIZE && (
                <div className="py-2 text-center text-[11px] text-muted/60">
                  Beginning of conversation
                </div>
              )}
            </div>

            {messages.map((m, idx) => (
              <ChatMessage
                key={m.id || `msg-${idx}`}
                message={m}
                actions={renderMessageActions}
              />
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

      {/* Error shown as a modal */}
      <ActionModal
        isOpen={!!error && dismissedError !== error}
        type="alert"
        title="Error"
        description={error?.message || "Failed to stream agent response."}
        isDestructive
        confirmText="OK"
        onConfirm={() => setDismissedError(error ?? null)}
        onCancel={() => setDismissedError(error ?? null)}
      />

      {/* Bottom Input Box */}
      <AgentChatInput
        onSend={handleSend}
        onStop={handleStop}
        isGenerating={isGenerating}
        placeholder={placeholder}
        headerBadge={headerBadge}
        onModelChange={setActiveModel}
      />
    </div>
  );
}

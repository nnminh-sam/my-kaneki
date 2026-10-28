"use client";

import { useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import type { ChatSession } from "@/lib/chat-sessions";

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function ChatSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  mobileOpen,
  onMobileOpenChange,
}: ChatSessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title || "New Chat");
  };

  const handleSaveRename = (
    id: string,
    e?: React.MouseEvent | React.FormEvent,
  ) => {
    if (e) e.stopPropagation();
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameSession(id, trimmed);
    }
    setEditingId(null);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(null);
  };

  return (
    <CollapsibleSidebar
      icon={<MessageSquare className="h-4 w-4" />}
      title="Chat Sessions"
      description="Conversation history"
      ariaLabel="Chat sessions sidebar"
      expandOnHover
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
    >
      {({ collapsed }) => (
        <>
          {/* New Chat Action */}
          <div>
            <button
              type="button"
              onClick={onNewSession}
              title="Start a new chat"
              aria-label="Start a new chat"
              className={`flex items-center rounded-xl bg-accent text-xs font-medium text-white shadow-xs transition-all hover:opacity-90 active:scale-95 cursor-pointer ${
                collapsed
                  ? "mx-auto h-8 w-8 justify-center"
                  : "w-full justify-center gap-2.5 px-2.5 py-2"
              }`}
            >
              <Plus className="h-4 w-4 shrink-0" />
              {!collapsed && <span>New Chat</span>}
            </button>
          </div>

          {!collapsed && <hr className="mx-2 border-t border-border" />}

          {/* Session List (hidden while collapsed) */}
          {!collapsed && <div className="space-y-1">
            {sessions.length === 0 ? (
              !collapsed && (
                <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted">
                  <MessageSquare className="mb-2 h-8 w-8 text-muted/40" />
                  <p>No chat sessions yet.</p>
                  <p className="mt-1">
                    Click &ldquo;New Chat&rdquo; to start a conversation.
                  </p>
                </div>
              )
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isEditing = editingId === session.id;
                const relTime = formatRelativeTime(
                  session.updatedAt || session.createdAt,
                );
                const label = session.title || "New Chat";

                if (isEditing && !collapsed) {
                  return (
                    <div
                      key={session.id}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-xl border border-accent bg-surface-subtle p-2 text-xs"
                    >
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleSaveRename(session.id, e);
                          if (e.key === "Escape") handleCancelRename();
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveRename(session.id, e)}
                        title="Save name"
                        className="rounded p-1 text-ok transition-colors hover:bg-ok-soft cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        title="Cancel"
                        className="rounded p-1 text-muted transition-colors hover:bg-surface hover:text-fg cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    title={
                      collapsed && relTime ? `${label} — ${relTime}` : label
                    }
                    className={`group flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                      isActive
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-surface-subtle hover:text-fg"
                    } ${collapsed ? "md:justify-center" : ""}`}
                  >
                    <MessageSquare
                      className={`h-4 w-4 shrink-0 ${
                        isActive
                          ? "text-accent"
                          : "text-muted group-hover:text-fg"
                      }`}
                    />
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1 pr-1">
                          <p className="truncate text-xs font-medium leading-tight">
                            {label}
                          </p>
                          <p className="truncate text-[10px] font-normal text-muted/80">
                            {relTime}
                          </p>
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(session, e)}
                            title="Rename conversation"
                            className="rounded p-1 text-muted transition-colors hover:text-accent cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(session.id);
                            }}
                            title="Delete conversation"
                            className="rounded p-1 text-muted transition-colors hover:text-danger cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>}
        </>
      )}
    </CollapsibleSidebar>
  );
}

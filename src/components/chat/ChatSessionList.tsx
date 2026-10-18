"use client";

import { useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ChatSession } from "@/lib/chat-sessions";

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
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
    return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
}: ChatSessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title || "New Chat");
  };

  const handleSaveRename = (id: string, e?: React.MouseEvent | React.FormEvent) => {
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
    <div className="flex h-full w-full flex-col border-r border-border bg-surface">
      {/* Header & New Chat button */}
      <div className="flex items-center justify-between border-b border-border p-3.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-fg">Chat Sessions</h2>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          title="Start a new chat"
          className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted">
            <MessageSquare className="h-8 w-8 text-muted/40 mb-2" />
            <p>No chat sessions yet.</p>
            <p className="mt-1">Click &ldquo;New Chat&rdquo; to start a conversation.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isEditing = editingId === session.id;

            if (isEditing) {
              return (
                <div
                  key={session.id}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded-lg border border-accent bg-surface-subtle p-2 text-xs"
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(session.id, e);
                      if (e.key === "Escape") handleCancelRename();
                    }}
                    autoFocus
                    className="flex-1 min-w-0 rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={(e) => handleSaveRename(session.id, e)}
                    title="Save name"
                    className="p-1 rounded text-ok hover:bg-ok-soft cursor-pointer transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRename}
                    title="Cancel"
                    className="p-1 rounded text-muted hover:text-fg hover:bg-surface cursor-pointer transition-colors"
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
                className={`group flex items-center justify-between rounded-lg p-2.5 text-left text-xs transition-all cursor-pointer ${
                  isActive
                    ? "bg-accent-soft text-accent font-medium border border-accent/20"
                    : "text-fg hover:bg-surface-subtle border border-transparent"
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2 flex-1">
                  <span className="truncate text-xs font-medium">{session.title || "New Chat"}</span>
                  <span className="text-[10px] text-muted">
                    {formatRelativeTime(session.updatedAt || session.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleStartRename(session, e)}
                    title="Rename conversation"
                    className="hover:text-accent p-1 rounded transition-colors cursor-pointer text-muted"
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
                    className="hover:text-danger p-1 rounded transition-colors cursor-pointer text-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

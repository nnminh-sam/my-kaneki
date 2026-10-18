"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { Menu, X } from "lucide-react";
import {
  type ChatSession,
  createNewSession,
  deleteChatSessionFromApi,
  deriveSessionTitle,
  fetchChatSessionsFromApi,
  getActiveSessionId,
  loadSavedSessions,
  renameChatSessionToApi,
  saveChatSessionToApi,
  saveSessionsToStorage,
  setActiveSessionId,
} from "@/lib/chat-sessions";
import { ChatSessionList } from "./ChatSessionList";
import { AgentChat } from "./AgentChat";

interface OverviewChatAppProps {
  initialSessions?: ChatSession[];
}

export function OverviewChatApp({ initialSessions }: OverviewChatAppProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions ?? []);
  const [activeId, setActiveId] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [showMobileSessions, setShowMobileSessions] = useState(false);

  // Initialize sessions on client mount
  useEffect(() => {
    let isCancelled = false;

    async function init() {
      let loadedSessions = initialSessions && initialSessions.length > 0 ? initialSessions : [];

      if (loadedSessions.length === 0) {
        // Try fetching from database API
        const apiSessions = await fetchChatSessionsFromApi();
        if (apiSessions.length > 0) {
          loadedSessions = apiSessions;
        } else {
          // Fall back to localStorage if available
          const localSaved = loadSavedSessions();
          if (localSaved.length > 0) {
            loadedSessions = localSaved;
            // Sync local sessions to database
            for (const s of localSaved) {
              void saveChatSessionToApi(s);
            }
          } else {
            // Create brand new session and persist
            const initial = createNewSession();
            loadedSessions = [initial];
            void saveChatSessionToApi(initial);
          }
        }
      }

      if (isCancelled) return;

      setSessions(loadedSessions);
      saveSessionsToStorage(loadedSessions);

      const savedActiveId = getActiveSessionId();
      if (savedActiveId && loadedSessions.some((s) => s.id === savedActiveId)) {
        setActiveId(savedActiveId);
      } else {
        const firstId = loadedSessions[0]?.id ?? "";
        setActiveId(firstId);
        if (firstId) setActiveSessionId(firstId);
      }

      setIsLoaded(true);
    }

    void init();

    return () => {
      isCancelled = true;
    };
  }, [initialSessions]);

  const handleSelectSession = (id: string) => {
    setActiveId(id);
    setActiveSessionId(id);
    setShowMobileSessions(false);
  };

  const handleNewSession = () => {
    const newSession = createNewSession();
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveId(newSession.id);
    saveSessionsToStorage(updated);
    setActiveSessionId(newSession.id);
    setShowMobileSessions(false);

    // Persist new session into database
    void saveChatSessionToApi(newSession);
  };

  const handleDeleteSession = (id: string) => {
    // Delete from database
    void deleteChatSessionFromApi(id);

    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setActiveId(fresh.id);
      saveSessionsToStorage([fresh]);
      setActiveSessionId(fresh.id);
      void saveChatSessionToApi(fresh);
    } else {
      setSessions(remaining);
      saveSessionsToStorage(remaining);
      if (activeId === id) {
        setActiveId(remaining[0].id);
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed, updatedAt: now } : s));
      saveSessionsToStorage(updated);
      return updated;
    });

    // Persist rename into database
    void renameChatSessionToApi(sessionId, trimmed);
  }, []);

  const handleUpdateSessionMessages = useCallback((sessionId: string, newMessages: UIMessage[]) => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === sessionId);
      if (!existing) return prev;

      // Don't update state if messages haven't changed
      if (
        existing.messages.length === newMessages.length &&
        existing.messages[existing.messages.length - 1]?.id === newMessages[newMessages.length - 1]?.id &&
        existing.messages[existing.messages.length - 1]?.parts === newMessages[newMessages.length - 1]?.parts
      ) {
        return prev;
      }

      const currentTitle =
        existing.title === "New Chat" ? deriveSessionTitle(newMessages, existing.title) : existing.title;
      const now = new Date().toISOString();
      const updatedSession: ChatSession = {
        ...existing,
        title: currentTitle,
        messages: newMessages,
        updatedAt: now,
      };

      const updated = prev.map((s) => (s.id === sessionId ? updatedSession : s));
      saveSessionsToStorage(updated);

      // Persist conversation update to database
      void saveChatSessionToApi({
        id: sessionId,
        title: currentTitle,
        messages: newMessages,
        updatedAt: now,
      });

      return updated;
    });
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Mobile session toggle button */}
      <button
        type="button"
        onClick={() => setShowMobileSessions(!showMobileSessions)}
        title="Toggle session list"
        className="absolute left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg shadow-xs md:hidden"
      >
        {showMobileSessions ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Left Session List Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-20 w-72 transition-transform duration-200 md:static md:translate-x-0 ${
          showMobileSessions ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSession?.id ?? ""}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Backdrop for mobile */}
      {showMobileSessions && (
        <div
          onClick={() => setShowMobileSessions(false)}
          className="fixed inset-0 z-10 bg-black/40 md:hidden"
        />
      )}

      {/* Right Main Chat Window */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {activeSession ? (
          <AgentChat
            key={activeSession.id}
            session={activeSession}
            onUpdateSessionMessages={handleUpdateSessionMessages}
            onRenameSession={handleRenameSession}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No active chat session.
          </div>
        )}
      </div>
    </div>
  );
}

import type { UIMessage } from "ai";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UIMessage[];
}

const STORAGE_KEY = "my_kaneki_chat_sessions_v1";
const ACTIVE_ID_KEY = "my_kaneki_active_chat_id_v1";

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createNewSession(title = "New Chat"): ChatSession {
  const now = new Date().toISOString();
  return {
    id: generateSessionId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function loadSavedSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export function saveSessionsToStorage(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error("Failed to save chat sessions to localStorage:", err);
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ID_KEY);
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

/** Merge existing and incoming messages safely by ID preserving order. */
export function mergeMessages(
  existingMessages: UIMessage[],
  incomingMessages: UIMessage[],
): UIMessage[] {
  if (!existingMessages || existingMessages.length === 0) {
    return incomingMessages || [];
  }
  if (!incomingMessages || incomingMessages.length === 0) {
    return existingMessages || [];
  }

  // Find index of first incoming message in existingMessages
  const firstIncomingId = incomingMessages[0]?.id;
  const matchIndex = existingMessages.findIndex((m) => m.id === firstIncomingId);

  if (matchIndex === -1) {
    const existingIds = new Set(existingMessages.map((m) => m.id));
    const isBrandNewTail = incomingMessages.every((m) => !existingIds.has(m.id));
    if (isBrandNewTail) {
      return [...existingMessages, ...incomingMessages];
    }

    // Build a map preserving existing order and overriding with newer versions
    const mergedMap = new Map<string, UIMessage>();
    for (const m of existingMessages) {
      if (m.id) mergedMap.set(m.id, m);
    }
    for (const m of incomingMessages) {
      if (m.id) mergedMap.set(m.id, m);
    }
    return Array.from(mergedMap.values());
  }

  const prefix = existingMessages.slice(0, matchIndex);
  return [...prefix, ...incomingMessages];
}

/** Fetch paginated chat messages for a session */
export async function fetchSessionMessages(
  sessionId: string,
  options?: { limit?: number; before?: string },
): Promise<{
  messages: UIMessage[];
  hasMore: boolean;
  total: number;
}> {
  const limit = options?.limit ?? 25;
  const before = options?.before;

  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);

    const res = await fetch(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?${params.toString()}`,
      { cache: "no-store" },
    );

    if (res.ok) {
      return (await res.json()) as {
        messages: UIMessage[];
        hasMore: boolean;
        total: number;
      };
    }
  } catch (err) {
    console.warn("Failed to fetch session messages from API, falling back to local storage:", err);
  }

  // Fallback to local storage
  const localSessions = loadSavedSessions();
  const session = localSessions.find((s) => s.id === sessionId);
  if (!session) {
    return { messages: [], hasMore: false, total: 0 };
  }

  const allMessages = session.messages || [];
  const total = allMessages.length;
  let endIndex = total;
  if (before) {
    const idx = allMessages.findIndex((m) => m.id === before);
    if (idx !== -1) endIndex = idx;
  }
  const startIndex = Math.max(0, endIndex - limit);
  return {
    messages: allMessages.slice(startIndex, endIndex),
    hasMore: startIndex > 0,
    total,
  };
}

/** Extracts a concise title from the first user message, or returns fallback. */
export function deriveSessionTitle(messages: UIMessage[], fallback = "New Chat"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return fallback;

  for (const part of firstUser.parts) {
    if (part.type === "text" && part.text.trim()) {
      const line = part.text.trim().split("\n")[0].trim();
      if (line.length <= 40) return line;
      return `${line.slice(0, 37)}...`;
    }
  }
  return fallback;
}

/** Fetch chat sessions from database via API */
export async function fetchChatSessionsFromApi(): Promise<ChatSession[]> {
  try {
    const res = await fetch("/api/chat/sessions", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: ChatSession[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

/** Save or update chat session in database via API */
export async function saveChatSessionToApi(session: {
  id: string;
  title?: string;
  messages?: UIMessage[];
  createdAt?: string;
  updatedAt?: string;
}): Promise<ChatSession | null> {
  try {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: ChatSession };
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** Rename chat session in database via API */
export async function renameChatSessionToApi(id: string, title: string): Promise<ChatSession | null> {
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: ChatSession };
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** Delete a chat session from database via API */
export async function deleteChatSessionFromApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

import type { UIMessage } from "ai";
import { getDb, type Row } from "./db";
import { deriveSessionTitle, type ChatSession } from "./chat-sessions";

function parseMessages(raw: unknown): UIMessage[] {
  if (Array.isArray(raw)) return raw as UIMessage[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as UIMessage[];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToChatSession(row: Row): ChatSession {
  return {
    id: String(row.id),
    title: String(row.title ?? "New Chat"),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ""),
    messages: parseMessages(row.messages),
  };
}

/** Lists all chat sessions for an owner, ordered newest updated first. */
export async function listChatSessions(ownerId: string): Promise<ChatSession[]> {
  const rows = await getDb().query(
    `select id, title, messages, created_at, updated_at
     from chat_sessions
     where owner_id = $1
     order by updated_at desc, id desc`,
    [ownerId],
  );
  return rows.map(rowToChatSession);
}

/** Fetches a single chat session by id for an owner. */
export async function getChatSession(ownerId: string, id: string): Promise<ChatSession | null> {
  const rows = await getDb().query(
    `select id, title, messages, created_at, updated_at
     from chat_sessions
     where owner_id = $1 and id = $2`,
    [ownerId, id],
  );
  if (!rows.length) return null;
  return rowToChatSession(rows[0]);
}

/**
 * Creates or updates a chat session for an owner.
 * If the session already exists for the owner, updates title, messages, and updated_at.
 */
export async function upsertChatSession(
  ownerId: string,
  session: {
    id: string;
    title?: string;
    messages?: UIMessage[];
    createdAt?: string;
    updatedAt?: string;
  },
): Promise<ChatSession> {
  const title = (session.title && session.title.trim()) || "New Chat";
  const hasMessages = session.messages !== undefined;
  const messagesJson = JSON.stringify(session.messages ?? []);
  const now = new Date().toISOString();

  const rows = await getDb().query(
    `insert into chat_sessions (id, owner_id, title, messages, created_at, updated_at)
     values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, now()), coalesce($6::timestamptz, now()))
     on conflict (id) do update set
       title = excluded.title,
       messages = case when $7::boolean then excluded.messages else chat_sessions.messages end,
       updated_at = excluded.updated_at
     where chat_sessions.owner_id = $2
     returning id, title, messages, created_at, updated_at`,
    [
      session.id,
      ownerId,
      title,
      messagesJson,
      session.createdAt || now,
      session.updatedAt || now,
      hasMessages,
    ],
  );

  if (!rows.length) {
    const existing = await getChatSession(ownerId, session.id);
    if (existing) return existing;
    throw new Error(`Failed to upsert chat session ${session.id}`);
  }

  return rowToChatSession(rows[0]);
}

/** Renames an existing chat session for an owner. */
export async function renameChatSession(
  ownerId: string,
  id: string,
  title: string,
): Promise<ChatSession | null> {
  const trimmed = title.trim() || "New Chat";
  const rows = await getDb().query(
    `update chat_sessions
     set title = $3, updated_at = now()
     where owner_id = $1 and id = $2
     returning id, title, messages, created_at, updated_at`,
    [ownerId, id, trimmed],
  );
  if (!rows.length) return null;
  return rowToChatSession(rows[0]);
}

/** Deletes a chat session for an owner. */
export async function deleteChatSession(ownerId: string, id: string): Promise<boolean> {
  await getDb().query(
    `delete from chat_sessions where owner_id = $1 and id = $2`,
    [ownerId, id],
  );
  return true;
}

/** Updates messages and auto-derives title if still using fallback title. */
export async function updateSessionMessages(
  ownerId: string,
  id: string,
  messages: UIMessage[],
  title?: string,
): Promise<ChatSession> {
  const existing = await getChatSession(ownerId, id);
  let resolvedTitle = title;
  if (!resolvedTitle) {
    if (existing && existing.title && existing.title !== "New Chat") {
      resolvedTitle = existing.title;
    } else {
      resolvedTitle = deriveSessionTitle(messages, existing?.title || "New Chat");
    }
  }

  const now = new Date().toISOString();
  return upsertChatSession(ownerId, {
    id,
    title: resolvedTitle,
    messages,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
}

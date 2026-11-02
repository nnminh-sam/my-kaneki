import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { UIMessage } from "ai";
import { setDbForTests } from "./db";
import { migrate } from "./migrate";
import {
  deleteChatSession,
  getChatSession,
  getChatSessionMessages,
  listChatSessions,
  renameChatSession,
  updateSessionMessages,
  upsertChatSession,
} from "./chat-db";
import { mergeMessages } from "./chat-sessions";

describe("Chat sessions database persistence (PGlite)", () => {
  it("migrates schema and persists chat sessions per owner", async () => {
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push((await pg.query(s.text, s.params)).rows as Record<string, unknown>[]);
        }
        return out;
      },
    });

    // Run migrations
    const applied = await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
    });
    assert.ok(applied.includes("004_chat_sessions"));

    const owner1 = "U-1";
    const owner2 = "U-2";

    // Initially empty
    const initialList = await listChatSessions(owner1);
    assert.equal(initialList.length, 0);

    // Create a new session for owner1
    const testMessages: UIMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello AI Assistant" }],
      },
      {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Hello! How can I help you today?" }],
      },
    ];

    const created = await upsertChatSession(owner1, {
      id: "session_test_1",
      title: "Hello AI Assistant",
      messages: testMessages,
    });

    assert.equal(created.id, "session_test_1");
    assert.equal(created.title, "Hello AI Assistant");
    assert.equal(created.messages.length, 2);
    assert.equal(created.messages[0].parts[0].type, "text");

    // Fetch single session
    const fetched = await getChatSession(owner1, "session_test_1");
    assert.ok(fetched);
    assert.equal(fetched.id, "session_test_1");
    assert.equal(fetched.messages.length, 2);
    assert.equal(fetched.messages[1].role, "assistant");

    // Verify isolation: owner2 cannot see owner1's session
    const owner2List = await listChatSessions(owner2);
    assert.equal(owner2List.length, 0);
    const owner2Fetched = await getChatSession(owner2, "session_test_1");
    assert.equal(owner2Fetched, null);

    // Update messages and test auto title derivation
    const moreMessages: UIMessage[] = [
      ...testMessages,
      {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "Add a todo: Learn TypeScript" }],
      },
    ];

    const updated = await updateSessionMessages(owner1, "session_test_1", moreMessages);
    assert.equal(updated.messages.length, 3);
    assert.equal(updated.title, "Hello AI Assistant"); // Keeps existing title

    // Update messages for a session starting with 'New Chat' derives new title
    const newSession = await upsertChatSession(owner1, {
      id: "session_test_2",
      title: "New Chat",
      messages: [],
    });
    assert.equal(newSession.title, "New Chat");

    const derived = await updateSessionMessages(owner1, "session_test_2", [
      {
        id: "m-1",
        role: "user",
        parts: [{ type: "text", text: "What is quantum computing?" }],
      },
    ]);
    assert.equal(derived.title, "What is quantum computing?");

    // List sessions shows both sessions for owner1
    const owner1List = await listChatSessions(owner1);
    assert.equal(owner1List.length, 2);

    // Test explicit session rename
    const renamed = await renameChatSession(owner1, "session_test_2", "Custom Renamed Title");
    assert.ok(renamed);
    assert.equal(renamed.title, "Custom Renamed Title");
    assert.equal(renamed.messages.length, 1); // Messages intact

    // Verify fetched title reflects the rename
    const fetchedRenamed = await getChatSession(owner1, "session_test_2");
    assert.equal(fetchedRenamed?.title, "Custom Renamed Title");

    // Delete session
    const deleted = await deleteChatSession(owner1, "session_test_1");
    assert.equal(deleted, true);

    const afterDelete = await listChatSessions(owner1);
    assert.equal(afterDelete.length, 1);
    assert.equal(afterDelete[0].id, "session_test_2");
    assert.equal(afterDelete[0].title, "Custom Renamed Title");
  });

  it("paginates messages and preserves older history during partial updates", async () => {
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push((await pg.query(s.text, s.params)).rows as Record<string, unknown>[]);
        }
        return out;
      },
    });

    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    const owner = "U-PAGE";
    const totalCount = 60;
    const allMessages: UIMessage[] = Array.from({ length: totalCount }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `Message content ${i}` }],
    }));

    await upsertChatSession(owner, {
      id: "session_paginated",
      title: "Long Conversation",
      messages: allMessages,
    });

    // Page 1: latest 25 messages (msg-35 to msg-59)
    const page1 = await getChatSessionMessages(owner, "session_paginated", { limit: 25 });
    assert.equal(page1.total, 60);
    assert.equal(page1.messages.length, 25);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.messages[0].id, "msg-35");
    assert.equal(page1.messages[24].id, "msg-59");

    // Page 2: 25 messages before msg-35 (msg-10 to msg-34)
    const page2 = await getChatSessionMessages(owner, "session_paginated", {
      limit: 25,
      before: page1.messages[0].id,
    });
    assert.equal(page2.messages.length, 25);
    assert.equal(page2.hasMore, true);
    assert.equal(page2.messages[0].id, "msg-10");
    assert.equal(page2.messages[24].id, "msg-34");

    // Page 3: remaining messages before msg-10 (msg-0 to msg-9)
    const page3 = await getChatSessionMessages(owner, "session_paginated", {
      limit: 25,
      before: page2.messages[0].id,
    });
    assert.equal(page3.messages.length, 10);
    assert.equal(page3.hasMore, false);
    assert.equal(page3.messages[0].id, "msg-0");
    assert.equal(page3.messages[9].id, "msg-9");

    // Test mergeMessages helper
    const loadedSlice = page1.messages; // msg-35 to msg-59
    const appendedSlice: UIMessage[] = [
      ...loadedSlice,
      {
        id: "msg-60",
        role: "user",
        parts: [{ type: "text", text: "New prompt after scrolling" }],
      },
    ];

    const merged = mergeMessages(allMessages, appendedSlice);
    assert.equal(merged.length, 61);
    assert.equal(merged[0].id, "msg-0"); // Older messages preserved
    assert.equal(merged[60].id, "msg-60"); // New message added

    // Test updateSessionMessages with partial tail preserves the whole conversation in DB
    const updated = await updateSessionMessages(owner, "session_paginated", appendedSlice);
    assert.equal(updated.messages.length, 61);
    assert.equal(updated.messages[0].id, "msg-0");
    assert.equal(updated.messages[60].id, "msg-60");
  });
});

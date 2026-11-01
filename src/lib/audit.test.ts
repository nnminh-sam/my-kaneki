import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "./db";
import { migrate } from "./migrate";
import { upsertChatSession } from "./chat-db";
import { addTodo } from "./todos";
import {
  querySessionAuditLogs,
  recordAudit,
  recordLlmGenerationAudit,
  wrapToolsWithSessionAudit,
} from "./audit";

describe("Session API & Tool Audit Log (PGlite)", () => {
  it("records tool calls, MCP APIs, LLM telemetry, and linked entity mutations per session", async () => {
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

    const applied = await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
    });
    assert.ok(applied.includes("003_audit_log"));
    assert.ok(applied.includes("010_session_audit_indexes"));

    const owner1 = "owner-audit-1";
    const owner2 = "owner-audit-2";
    const session1 = "session_alpha";
    const session2 = "session_beta";

    await upsertChatSession(owner1, {
      id: session1,
      title: "Debug Agent Optimization",
      messages: [],
    });

    await upsertChatSession(owner1, {
      id: session2,
      title: "MCP Sprint Planning",
      messages: [],
    });

    // 1. Wrap workspace & LMS tools and execute inside session1
    const mockWorkspaceTools = wrapToolsWithSessionAudit(
      {
        addTodo: {
          execute: async ({ title }: { title: string }, _opts?: { toolCallId?: string }) => {
            await addTodo(owner1, title, "ai-agent");
            return { success: true, title };
          },
        },
        lmsSearchKnowledge: {
          execute: async (
            { subjectSlug, query }: { subjectSlug: string; query: string },
            _opts?: { toolCallId?: string },
          ) => {
            await recordAudit({
              action: "lms.rag.search",
              entityType: "lms_subject",
              entityId: subjectSlug,
              actor: "ai-agent",
              payload: { query, matchCount: 3 },
            });
            return { success: true, matches: [{ id: "c1" }, { id: "c2" }, { id: "c3" }] };
          },
        },
        failingTool: {
          execute: async (_args?: Record<string, unknown>, _opts?: { toolCallId?: string }) => {
            return { success: false, error: "GitHub API 409 Conflict" };
          },
        },
      },
      { ownerId: owner1, sessionId: session1, isMcp: false },
    );

    // Execute tools in session1
    await mockWorkspaceTools.addTodo.execute({ title: "Profile token usage" }, { toolCallId: "tc_1" });
    await mockWorkspaceTools.lmsSearchKnowledge.execute(
      { subjectSlug: "distributed-systems", query: "Raft leader election" },
      { toolCallId: "tc_2" },
    );
    await mockWorkspaceTools.failingTool.execute({}, { toolCallId: "tc_3" });

    // Record LLM generation step telemetry for session1
    await recordLlmGenerationAudit({
      ownerId: owner1,
      sessionId: session1,
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      stepCount: 3,
      finishReason: "stop",
      inputTokens: 820,
      outputTokens: 340,
      totalTokens: 1160,
      durationMs: 1450,
      toolCallCount: 3,
      toolNames: ["addTodo", "lmsSearchKnowledge", "failingTool"],
    });

    // 2. Wrap MCP tool and execute inside session2
    const mockMcpTools = wrapToolsWithSessionAudit(
      {
        my_pm_list_tasks: {
          execute: async ({ projectId }: { projectId: string }, _opts?: { toolCallId?: string }) => {
            return { content: [{ type: "text", text: `Tasks for ${projectId}` }] };
          },
        },
      },
      { ownerId: owner1, sessionId: session2, isMcp: true },
    );

    await mockMcpTools.my_pm_list_tasks.execute({ projectId: "proj_99" }, { toolCallId: "tc_mcp_1" });

    // 3. Query audit logs filtered to session1
    const s1Audit = await querySessionAuditLogs(owner1, { sessionId: session1 });
    assert.equal(s1Audit.sessions.length, 2);

    // session1 has:
    // - 3 tool calls (addTodo, lmsSearchKnowledge, failingTool)
    // - 1 LLM generation step
    // - 2 downstream entity mutations (todo.create + lms.rag.search) linked via AsyncLocalStorage!
    assert.equal(s1Audit.summary.totalToolCalls, 3);
    assert.equal(s1Audit.summary.llmGenerations, 1);
    assert.equal(s1Audit.summary.entityMutations, 2);
    assert.equal(s1Audit.summary.totalEvents, 6);
    assert.equal(s1Audit.summary.totalTokens, 1160);
    assert.equal(s1Audit.summary.inputTokens, 820);
    assert.equal(s1Audit.summary.outputTokens, 340);
    assert.equal(s1Audit.summary.errorCount, 1);
    assert.equal(s1Audit.summary.successCount, 5);

    // Verify tool breakdown
    const toolNamesInBreakdown = s1Audit.summary.toolBreakdown.map((t) => t.toolName);
    assert.ok(toolNamesInBreakdown.includes("addTodo"));
    assert.ok(toolNamesInBreakdown.includes("lmsSearchKnowledge"));
    assert.ok(toolNamesInBreakdown.includes("failingTool"));

    // 4. Filter by category = mcp_api across all sessions
    const mcpAudit = await querySessionAuditLogs(owner1, {
      sessionId: "all",
      category: "mcp_api",
    });
    assert.equal(mcpAudit.events.length, 1);
    assert.equal(mcpAudit.events[0].toolName, "my_pm_list_tasks");
    assert.equal(mcpAudit.events[0].sessionId, session2);

    // 5. Filter by status = error
    const errorAudit = await querySessionAuditLogs(owner1, {
      sessionId: session1,
      status: "error",
    });
    assert.equal(errorAudit.events.length, 1);
    assert.equal(errorAudit.events[0].toolName, "failingTool");
    assert.equal(errorAudit.events[0].error, "GitHub API 409 Conflict");

    // 6. Verify cross-owner isolation
    const owner2Audit = await querySessionAuditLogs(owner2, { sessionId: "all" });
    assert.equal(owner2Audit.events.length, 0);
    assert.equal(owner2Audit.sessions.length, 0);
  });
});

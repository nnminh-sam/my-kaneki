import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { setEmbedderForTests, createDeterministicFakeEmbedder } from "@/lib/lms/embeddings";
import { POST, GET, DELETE } from "./route";
import { createQuiz } from "@/lib/lms/repo";

describe("Remote MCP Server (/api/mcp)", () => {
  const TEST_API_KEY = "test-secret-mcp-key-1234567890123456";
  const OWNER_ALICE = "user-alice";
  const OWNER_BOB = "user-bob";

  async function setupTestDb() {
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push(
            (await pg.query(s.text, s.params)).rows as Record<string, unknown>[],
          );
        }
        return out;
      },
    });

    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    setEmbedderForTests(createDeterministicFakeEmbedder(1536));
    process.env.JWT_SECRET = "abcdefghijklmnopqrstuvwxyz0123456789";
    process.env.KANEKI_MCP_API_KEY = TEST_API_KEY;
    process.env.KANEKI_MCP_OWNER_ID = OWNER_ALICE;
    return pg;
  }

  function makeMcpRequest(
    method: string,
    body?: any,
    options: {
      auth?: string;
      origin?: string;
      host?: string;
    } = {},
  ): NextRequest {
    const url = "http://localhost:3000/api/mcp";
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json, text/event-stream");

    if (options.auth !== undefined) {
      if (options.auth) headers.set("authorization", options.auth);
    } else {
      headers.set("authorization", `Bearer ${TEST_API_KEY}`);
    }

    if (options.origin) {
      headers.set("origin", options.origin);
    }

    headers.set("host", options.host || "localhost:3000");

    const init: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    return new NextRequest(url, init as any);
  }

  async function callMcpRpc(method: string, params: any = {}, options: any = {}) {
    const req = makeMcpRequest(
      "POST",
      {
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 10000),
        method,
        params,
      },
      options,
    );

    const res = await POST(req);
    const text = await res.text();
    let parsed: any = null;

    const sseMatch = text.match(/data:\s*(\{.*\})/);
    if (sseMatch) {
      try {
        parsed = JSON.parse(sseMatch[1]);
      } catch {}
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {}
    }

    return { status: res.status, rawText: text, json: parsed };
  }

  it("handles HTTP protocol constraints & auth enforcement", async () => {
    await setupTestDb();

    // 1. GET returns 405 Method Not Allowed in stateless mode
    const getRes = await GET();
    assert.equal(getRes.status, 405);

    // 2. DELETE returns 405 Method Not Allowed
    const deleteRes = await DELETE();
    assert.equal(deleteRes.status, 405);

    // 3. Unauthenticated POST returns 401
    const unauthReq = makeMcpRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { auth: "" },
    );
    const unauthRes = await POST(unauthReq);
    assert.equal(unauthRes.status, 401);
    assert.ok(unauthRes.headers.get("www-authenticate"));

    // 4. DNS Rebinding check: malicious origin returns 403 Forbidden
    const rebindingReq = makeMcpRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { origin: "http://attacker-controlled-site.com", host: "localhost:3000" },
    );
    const rebindingRes = await POST(rebindingReq);
    assert.equal(rebindingRes.status, 403);
  });

  it("registers contract tool names, resources, and prompts", async () => {
    await setupTestDb();

    // 1. tools/list
    const toolsResult = await callMcpRpc("tools/list", {});
    assert.equal(toolsResult.status, 200);
    const toolNames = toolsResult.json?.result?.tools?.map((t: any) => t.name) || [];

    const expectedTools = [
      "lms_get_or_update_learner_profile",
      "lms_create_subject",
      "lms_ingest_user_file",
      "lms_start_research_session",
      "lms_submit_research_draft",
      "lms_validate_research_draft",
      "lms_resolve_research_escalation",
      "lms_search_rag",
      "lms_placement_start",
      "lms_placement_submit_step",
      "lms_draft_learning_path",
      "lms_get_next_nodes",
      "lms_generate_quiz",
      "lms_submit_quiz",
    ];

    for (const expected of expectedTools) {
      assert.ok(toolNames.includes(expected), `Missing registered MCP tool: ${expected}`);
    }

    // 2. resources/list
    const resourcesResult = await callMcpRpc("resources/list", {});
    assert.equal(resourcesResult.status, 200);
    const resourceUris = resourcesResult.json?.result?.resources?.map((r: any) => r.uri) || [];
    assert.ok(resourceUris.includes("lms://profile"));
    assert.ok(resourceUris.includes("lms://reviews/due"));

    // 3. resources/read
    const readProfileResult = await callMcpRpc("resources/read", { uri: "lms://profile" });
    assert.equal(readProfileResult.status, 200);
    assert.ok(readProfileResult.json?.result?.contents?.[0]?.text);

    // 4. prompts/list
    const promptsResult = await callMcpRpc("prompts/list", {});
    assert.equal(promptsResult.status, 200);
    const promptNames = promptsResult.json?.result?.prompts?.map((p: any) => p.name) || [];

    const expectedPrompts = [
      "lms-orchestrate-research",
      "lms-research-agent",
      "lms-validate-agent",
      "lms-conduct-placement",
      "lms-tutor-node",
      "lms-daily-review",
    ];

    for (const expected of expectedPrompts) {
      assert.ok(promptNames.includes(expected), `Missing registered MCP prompt: ${expected}`);
    }

    // 5. prompts/get
    const getPromptResult = await callMcpRpc("prompts/get", {
      name: "lms-conduct-placement",
      arguments: {
        subjectTitle: "Distributed Systems",
        subjectSlug: "distributed-systems",
        currentMid: "2",
        lowBound: "1",
        highBound: "4",
      },
    });
    assert.equal(getPromptResult.status, 200);
    const promptMessage = getPromptResult.json?.result?.messages?.[0]?.content?.text;
    assert.ok(promptMessage.includes("LMS Diagnostic Placement Proctor"));
    assert.ok(promptMessage.includes("Tier 2"));
  });

  it("executes tools across all groups A through E with strict security", async () => {
    await setupTestDb();

    // Group A: lms_create_subject
    const createSubjResult = await callMcpRpc("tools/call", {
      name: "lms_create_subject",
      arguments: {
        title: "Kubernetes Operators",
        difficultyScaleN: 2,
      },
    });
    assert.equal(createSubjResult.status, 200);
    const createdSubj = JSON.parse(createSubjResult.json?.result?.content?.[0]?.text);
    assert.equal(createdSubj.slug, "kubernetes-operators");

    // Group A: lms_get_or_update_learner_profile
    const updateProfileResult = await callMcpRpc("tools/call", {
      name: "lms_get_or_update_learner_profile",
      arguments: {
        learningStyle: { mode: "code_first", pace: "intensive" },
        preferredLanguages: "Go, Rust",
      },
    });
    assert.equal(updateProfileResult.status, 200);
    const updatedProfile = JSON.parse(updateProfileResult.json?.result?.content?.[0]?.text);
    assert.equal(updatedProfile.learning_style.mode, "code_first");
    assert.equal(updatedProfile.preferred_languages, "Go, Rust");

    // Group B: lms_ingest_user_file
    const ingestResult = await callMcpRpc("tools/call", {
      name: "lms_ingest_user_file",
      arguments: {
        subjectSlug: "kubernetes-operators",
        filename: "operator-spec.md",
        contentText: "# Operator Pattern\nReconciliation loops reconcile desired state with actual state.",
      },
    });
    assert.equal(ingestResult.status, 200);
    const ingestData = JSON.parse(ingestResult.json?.result?.content?.[0]?.text);
    assert.equal(ingestData.success, true);
    assert.ok(ingestData.sourceId);

    // Group B: lms_search_rag
    const ragResult = await callMcpRpc("tools/call", {
      name: "lms_search_rag",
      arguments: {
        subjectSlug: "kubernetes-operators",
        query: "reconciliation loop",
      },
    });
    assert.equal(ragResult.status, 200);

    // Seed placement quizzes for tiers 1 and 2
    for (let tier = 1; tier <= 2; tier++) {
      await createQuiz(OWNER_ALICE, createdSubj.id, {
        quizPurpose: "placement",
        quizType: "mcq_4",
        difficultyLevel: tier,
        promptPayload: {
          type: "mcq_4",
          question: `Operator question for tier ${tier}`,
          options: [
            { label: "A", text: "Incorrect" },
            { label: "B", text: "Correct" },
            { label: "C", text: "Distractor" },
            { label: "D", text: "Other" },
          ],
          correctOption: "B",
        },
      });
    }

    // Group C: lms_placement_start
    const placementStartResult = await callMcpRpc("tools/call", {
      name: "lms_placement_start",
      arguments: {
        subjectSlug: "kubernetes-operators",
      },
    });
    assert.equal(placementStartResult.status, 200);
    const startData = JSON.parse(placementStartResult.json?.result?.content?.[0]?.text);
    assert.ok(startData.session.id);
    // Crucial security test: correctOption must be stripped
    assert.equal(startData.question.prompt_payload.correctOption, undefined);

    // Group C: lms_placement_submit_step
    const placementStepResult = await callMcpRpc("tools/call", {
      name: "lms_placement_submit_step",
      arguments: {
        sessionId: startData.session.id,
        quizId: startData.question.id,
        submission: {
          type: "mcq_4",
          selectedOption: "B",
        },
      },
    });
    assert.equal(placementStepResult.status, 200);

    // Group D: lms_draft_learning_path
    const draftPathResult = await callMcpRpc("tools/call", {
      name: "lms_draft_learning_path",
      arguments: {
        subjectSlug: "kubernetes-operators",
        nodes: [
          {
            id: "node-1",
            title: "CRDs",
            difficultyLevel: 1,
            ordinal: 1,
            sourceIds: [ingestData.sourceId],
            studyGuideMarkdown: "# Custom Resource Definitions\nMaterial.",
          },
          {
            id: "node-2",
            title: "Controllers",
            difficultyLevel: 2,
            ordinal: 2,
            sourceIds: [ingestData.sourceId],
            studyGuideMarkdown: "# Controllers\nMaterial.",
          },
        ],
        edges: [{ nodeId: "node-2", dependsOnNodeId: "node-1" }],
      },
    });
    assert.equal(draftPathResult.status, 200);
    const draftData = JSON.parse(draftPathResult.json?.result?.content?.[0]?.text);
    assert.equal(draftData.valid, true);

    // Group D: lms_get_next_nodes
    const nextNodesResult = await callMcpRpc("tools/call", {
      name: "lms_get_next_nodes",
      arguments: {
        subjectSlug: "kubernetes-operators",
      },
    });
    assert.equal(nextNodesResult.status, 200);

    // Group E: lms_generate_quiz for locked node-2 MUST fail
    const genLockedResult = await callMcpRpc("tools/call", {
      name: "lms_generate_quiz",
      arguments: {
        subjectSlug: "kubernetes-operators",
        nodeId: "node-2",
        quizPurpose: "mastery_gate",
        quizType: "mcq_4",
        difficultyLevel: 2,
        promptPayload: {
          type: "mcq_4",
          question: "Locked node question?",
          options: [
            { label: "A", text: "A" },
            { label: "B", text: "B" },
            { label: "C", text: "C" },
            { label: "D", text: "D" },
          ],
          correctOption: "A",
        },
      },
    });
    assert.equal(genLockedResult.json?.result?.isError, true);

    // Group E: lms_generate_quiz (Mastery Gate for unlocked node-1)
    const genQuizResult = await callMcpRpc("tools/call", {
      name: "lms_generate_quiz",
      arguments: {
        subjectSlug: "kubernetes-operators",
        nodeId: "node-1",
        quizPurpose: "mastery_gate",
        quizType: "mcq_4",
        difficultyLevel: 1,
        promptPayload: {
          type: "mcq_4",
          question: "What handles custom resource definitions?",
          options: [
            { label: "A", text: "APIServer & CRDs" },
            { label: "B", text: "Kubelet" },
            { label: "C", text: "Etcd" },
            { label: "D", text: "Ingress" },
          ],
          correctOption: "A",
        },
      },
    });
    assert.equal(genQuizResult.status, 200);
    const genQuizData = JSON.parse(genQuizResult.json?.result?.content?.[0]?.text);
    // Crucial: response from lms_generate_quiz does not echo the answer key!
    assert.equal(genQuizData.prompt_payload.correctOption, undefined);

    // Group E: lms_submit_quiz
    const submitQuizResult = await callMcpRpc("tools/call", {
      name: "lms_submit_quiz",
      arguments: {
        quizId: genQuizData.id,
        submission: {
          type: "mcq_4",
          selectedOption: "A",
        },
      },
    });
    assert.equal(submitQuizResult.status, 200);
    const submitData = JSON.parse(submitQuizResult.json?.result?.content?.[0]?.text);
    assert.equal(submitData.passed, true);
  });

  it("enforces cross-owner isolation: Owner B cannot access Owner A's subjects", async () => {
    await setupTestDb();

    // Alice creates a subject
    process.env.KANEKI_MCP_OWNER_ID = OWNER_ALICE;
    const createRes = await callMcpRpc("tools/call", {
      name: "lms_create_subject",
      arguments: {
        title: "Alice Private Systems",
        slug: "alice-private-systems",
      },
    });
    assert.equal(createRes.status, 200);

    // Switch to Bob
    process.env.KANEKI_MCP_OWNER_ID = OWNER_BOB;

    // Bob tries to get next nodes for Alice's subject -> returns error / not found
    const bobNextNodesRes = await callMcpRpc("tools/call", {
      name: "lms_get_next_nodes",
      arguments: {
        subjectSlug: "alice-private-systems",
      },
    });
    assert.equal(bobNextNodesRes.json?.result?.isError, true);
    assert.ok(bobNextNodesRes.json?.result?.content?.[0]?.text.includes("not found"));
  });

  it("verifies tool schemas match the exact contract snapshot", async () => {
    await setupTestDb();

    const toolsResult = await callMcpRpc("tools/list", {});
    const tools = toolsResult.json?.result?.tools || [];
    const schemaSnapshot: Record<string, string[]> = {};

    for (const tool of tools) {
      schemaSnapshot[tool.name] = Object.keys(tool.inputSchema.properties || {}).sort();
    }

    assert.deepEqual(schemaSnapshot, {
      lms_create_subject: ["capstoneProject", "difficultyScaleN", "slug", "title"],
      lms_draft_learning_path: ["attemptRound", "capstoneProject", "edges", "nodes", "subjectSlug"],
      lms_generate_quiz: [
        "difficultyLevel",
        "nodeId",
        "placementSessionId",
        "promptPayload",
        "quizPurpose",
        "quizType",
        "subjectSlug",
      ],
      lms_get_next_nodes: ["subjectSlug"],
      lms_get_or_update_learner_profile: ["learningStyle", "preferredLanguages"],
      lms_ingest_user_file: ["contentBase64", "contentText", "filename", "subjectSlug"],
      lms_placement_start: ["subjectSlug"],
      lms_placement_submit_step: ["quizId", "sessionId", "submission"],
      lms_resolve_research_escalation: ["confirmationToken", "editedMarkdown", "sourceId", "userDecision", "userNotes"],
      lms_search_rag: ["difficultyLevel", "limit", "perspective", "query", "subjectSlug", "track"],
      lms_start_research_session: ["originalUri", "perspective", "subjectSlug", "topicTitle"],
      lms_submit_quiz: ["quizId", "submission"],
      lms_submit_research_draft: ["citations", "defenseArgument", "draftMarkdown", "sourceId"],
      lms_validate_research_draft: ["critiqueSummary", "decision", "defects", "sourceId"],
    });
  });
});

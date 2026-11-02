import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { NodeRow, NodeEdgeRow, QuizSubmission, QuizPromptPayload } from "./types";
import { quizSubmissionSchema, quizPromptPayloadSchema, normalizeQuizPromptPayload } from "./types";

describe("LMS Phase 5: Learner UI Logic & Contracts", () => {
  it("groups nodes by difficulty level and orders them by ordinal", () => {
    const rawNodes: Partial<NodeRow>[] = [
      { id: "node-3", difficulty_level: 2, ordinal: 3, title: "Third Node", status: "locked" },
      { id: "node-1", difficulty_level: 1, ordinal: 1, title: "First Node", status: "completed" },
      { id: "node-2", difficulty_level: 1, ordinal: 2, title: "Second Node", status: "in_progress" },
      { id: "node-4", difficulty_level: 3, ordinal: 4, title: "Fourth Node", status: "locked" },
    ];

    const tierMap = new Map<number, Partial<NodeRow>[]>();
    for (const node of rawNodes) {
      const list = tierMap.get(node.difficulty_level!) ?? [];
      list.push(node);
      tierMap.set(node.difficulty_level!, list);
    }

    const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
    assert.deepEqual(sortedTiers, [1, 2, 3]);

    const tier1Nodes = tierMap.get(1)!.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
    assert.equal(tier1Nodes[0].id, "node-1");
    assert.equal(tier1Nodes[1].id, "node-2");
  });

  it("accurately identifies the first active node for Continue button", () => {
    const nodes: Partial<NodeRow>[] = [
      { id: "node-1", status: "completed" },
      { id: "node-2", status: "mastered_by_placement" },
      { id: "node-3", status: "in_progress" },
      { id: "node-4", status: "unlocked" },
      { id: "node-5", status: "locked" },
    ];

    const firstActiveNode =
      nodes.find((n) => n.status === "in_progress") ||
      nodes.find((n) => n.status === "unlocked") ||
      nodes[0];

    assert.equal(firstActiveNode?.id, "node-3");

    // When none in_progress, picks unlocked
    const unlockedOnly: Partial<NodeRow>[] = [
      { id: "node-1", status: "completed" },
      { id: "node-2", status: "unlocked" },
      { id: "node-3", status: "locked" },
    ];
    const nextActive =
      unlockedOnly.find((n) => n.status === "in_progress") ||
      unlockedOnly.find((n) => n.status === "unlocked") ||
      unlockedOnly[0];

    assert.equal(nextActive?.id, "node-2");
  });

  it("maps prerequisites correctly from edge dependencies", () => {
    const allNodes: Partial<NodeRow>[] = [
      { id: "n1", ordinal: 1, title: "Concurrency" },
      { id: "n2", ordinal: 2, title: "Networking" },
      { id: "n3", ordinal: 3, title: "Distributed Consensus" },
    ];
    const edges: NodeEdgeRow[] = [
      { node_id: "n3", depends_on_node_id: "n1", created_at: "" },
      { node_id: "n3", depends_on_node_id: "n2", created_at: "" },
    ];

    const allNodesMap = new Map<string, Partial<NodeRow>>(
      allNodes.map((n) => [n.id!, n]),
    );

    const prereqMap = new Map<string, string[]>();
    for (const edge of edges) {
      const list = prereqMap.get(edge.node_id) ?? [];
      const parentNode = allNodesMap.get(edge.depends_on_node_id);
      const parentLabel = parentNode
        ? String(parentNode.ordinal || 1).padStart(2, "0")
        : edge.depends_on_node_id;
      list.push(parentLabel);
      prereqMap.set(edge.node_id, list);
    }

    assert.deepEqual(prereqMap.get("n3"), ["01", "02"]);
    assert.equal(prereqMap.get("n1"), undefined);
  });

  it("validates polymorphic submissions against schema", () => {
    // 1. MCQ
    const mcqSub: QuizSubmission = {
      type: "mcq_4",
      selectedOption: "B",
    };
    assert.doesNotThrow(() => quizSubmissionSchema.parse(mcqSub));

    // 2. Open Ended
    const openSub: QuizSubmission = {
      type: "open_ended",
      response: "A write-ahead log ensures crash recovery by writing mutations monotonically to durable disk.",
    };
    assert.doesNotThrow(() => quizSubmissionSchema.parse(openSub));

    // 3. Code Challenge
    const codeSub: QuizSubmission = {
      type: "code_challenge",
      code: "func appendEntries() bool { return true }",
    };
    assert.doesNotThrow(() => quizSubmissionSchema.parse(codeSub));

    // 4. Project Task
    const projSub: QuizSubmission = {
      type: "project_task",
      completedChecklistIndices: [0, 1, 2],
      commitUrl: "https://github.com/myuser/kaneki-project/commit/abcdef",
    };
    assert.doesNotThrow(() => quizSubmissionSchema.parse(projSub));
  });

  it("verifies placement progress step bounds (question k of <= ceil(log2 N))", () => {
    const scales = [
      { n: 1, expectedMax: 0 },
      { n: 2, expectedMax: 1 },
      { n: 4, expectedMax: 2 },
      { n: 8, expectedMax: 3 },
      { n: 16, expectedMax: 4 },
      { n: 32, expectedMax: 5 },
    ];

    for (const { n, expectedMax } of scales) {
      const maxSteps = Math.ceil(Math.log2(Math.max(n, 1)));
      assert.equal(maxSteps, expectedMax);
    }
  });

  it("verifies no hardcoded mock data containing the preview topic word 'raft' exists in UI code", async () => {
    async function scanDir(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await scanDir(fullPath)));
        } else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
          !entry.name.endsWith(".test.ts")
        ) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const targets = [
      path.resolve("src/components/lms"),
      path.resolve("src/app/(workspace)/learning"),
    ];

    const allFiles: string[] = [];
    for (const target of targets) {
      allFiles.push(...(await scanDir(target)));
    }

    const raftWordRegex = /\braft\b/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of allFiles) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (raftWordRegex.test(lines[i])) {
          violations.push({ file, line: i + 1, text: lines[i].trim() });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found hardcoded mock word "raft" in UI components:\n${violations
        .map((v) => `${v.file}:${v.line}: ${v.text}`)
        .join("\n")}`,
    );
  });

  it("normalizes agent raw promptPayload into valid polymorphic quiz schemas", () => {
    // 1. Unstructured scenarios without type or rubricCriteria (the exact bug from conversation)
    const rawOpenEnded = {
      scenario1: "Designing a Recently Viewed list for a browser with fast back/forward.",
      scenario2: "A system processing tasks FCFS with zero latency spikes.",
      scenario3: "Reversing a string using a data structure.",
    };

    const normalizedOpenEnded = normalizeQuizPromptPayload("open_ended", rawOpenEnded);
    assert.equal(normalizedOpenEnded.type, "open_ended");
    assert.ok(normalizedOpenEnded.prompt.includes("Scenario 1"));
    assert.ok(normalizedOpenEnded.prompt.includes("Scenario 2"));
    assert.ok(normalizedOpenEnded.prompt.includes("Scenario 3"));
    assert.ok(normalizedOpenEnded.rubricCriteria.length >= 1);

    // 1b. Array of scenario objects with { context, question }
    const rawArrayScenarios = {
      scenarios: [
        {
          context: "You are building an Undo system.",
          question: "Which data structure would you use?",
        },
        {
          context: "A print server receives documents.",
          question: "Which queue implementation is optimal?",
        },
      ],
    };
    const normalizedArrayScenarios = normalizeQuizPromptPayload("open_ended", rawArrayScenarios);
    assert.equal(normalizedArrayScenarios.type, "open_ended");
    assert.ok(normalizedArrayScenarios.prompt.includes("### Scenario 1"));
    assert.ok(normalizedArrayScenarios.prompt.includes("**Context**: You are building an Undo system."));
    assert.ok(normalizedArrayScenarios.prompt.includes("**Question**: Which data structure would you use?"));
    assert.ok(normalizedArrayScenarios.prompt.includes("### Scenario 2"));

    // 1c. Serialized JSON scenarios string in prompt
    const rawJsonPrompt = {
      prompt: `scenarios: [{"context":"Memory is constrained.","question":"Which data structure?"}]`,
    };
    const normalizedJsonPrompt = normalizeQuizPromptPayload("open_ended", rawJsonPrompt);
    assert.equal(normalizedJsonPrompt.type, "open_ended");
    assert.ok(normalizedJsonPrompt.prompt.includes("### Scenario 1"));
    assert.ok(normalizedJsonPrompt.prompt.includes("**Context**: Memory is constrained."));
    assert.ok(normalizedJsonPrompt.prompt.includes("**Question**: Which data structure?"));

    // 2. MCQ with dictionary options instead of array of tuples
    const rawMcq = {
      prompt: "Which data structure provides O(1) random access?",
      options: {
        A: "Array",
        B: "Linked List",
        C: "Binary Search Tree",
        D: "Queue",
      },
      correctOption: "A",
    };

    const normalizedMcq = normalizeQuizPromptPayload("mcq_4", rawMcq);
    assert.equal(normalizedMcq.type, "mcq_4");
    assert.equal(normalizedMcq.question, "Which data structure provides O(1) random access?");
    assert.equal(normalizedMcq.options.length, 4);
    assert.equal(normalizedMcq.options[0].label, "A");
    assert.equal(normalizedMcq.options[0].text, "Array");
    assert.equal(normalizedMcq.correctOption, "A");
  });
});

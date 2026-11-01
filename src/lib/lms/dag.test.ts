import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectCycle,
  topoOrder,
  unlockedNodes,
  validatePath,
  type GraphNode,
  type GraphEdge,
} from "./dag";

describe("DAG Path Engine & Cycle Detection", () => {
  it("detects direct and indirect cycles", () => {
    // 2-node cycle: A depends on B, B depends on A
    const edges2: GraphEdge[] = [
      { nodeId: "node-A", dependsOnNodeId: "node-B" },
      { nodeId: "node-B", dependsOnNodeId: "node-A" },
    ];
    const cycles2 = detectCycle(["node-A", "node-B"], edges2);
    assert.ok(cycles2.length > 0);
    assert.ok(cycles2[0].includes("Cycle detected involving:"));

    // 3-node cycle: A -> B -> C -> A
    const edges3: GraphEdge[] = [
      { nodeId: "node-A", dependsOnNodeId: "node-B" },
      { nodeId: "node-B", dependsOnNodeId: "node-C" },
      { nodeId: "node-C", dependsOnNodeId: "node-A" },
    ];
    const cycles3 = detectCycle(["node-A", "node-B", "node-C"], edges3);
    assert.ok(cycles3.length > 0);
  });

  it("permits diamond graphs without reporting false cycles", () => {
    // Diamond DAG:
    // D depends on B and C
    // B depends on A
    // C depends on A
    const nodeIds = ["node-A", "node-B", "node-C", "node-D"];
    const edges: GraphEdge[] = [
      { nodeId: "node-B", dependsOnNodeId: "node-A" },
      { nodeId: "node-C", dependsOnNodeId: "node-A" },
      { nodeId: "node-D", dependsOnNodeId: "node-B" },
      { nodeId: "node-D", dependsOnNodeId: "node-C" },
    ];
    const cycles = detectCycle(nodeIds, edges);
    assert.equal(cycles.length, 0);

    const order = topoOrder(nodeIds, edges);
    assert.equal(order[0], "node-A");
    assert.equal(order[3], "node-D");
  });

  it("computes unlocked nodes based on satisfied prerequisites", () => {
    const nodes = [
      { id: "node-1", status: "completed" },
      { id: "node-2", status: "locked" },
      { id: "node-3", status: "locked" },
    ];
    // node-2 depends on node-1 (satisfied)
    // node-3 depends on node-2 (not satisfied)
    const edges: GraphEdge[] = [
      { nodeId: "node-2", dependsOnNodeId: "node-1" },
      { nodeId: "node-3", dependsOnNodeId: "node-2" },
    ];

    const unlocked = unlockedNodes(nodes, edges);
    assert.deepEqual(unlocked, ["node-2"]);
  });

  it("validates paths and reports structural and pedagogical defects", () => {
    const nodes: GraphNode[] = [
      {
        id: "node-1",
        difficultyLevel: 3,
        sourceIds: ["src-1"],
      },
      {
        id: "node-2",
        difficultyLevel: 2, // INVERSION: node-2 (tier 2) depends on node-1 (tier 3)!
        sourceIds: ["src-1"],
      },
      {
        id: "node-3",
        difficultyLevel: 4,
        sourceIds: [], // Defect: no sources
      },
    ];

    const edges: GraphEdge[] = [
      { nodeId: "node-2", dependsOnNodeId: "node-1" },
      { nodeId: "node-3", dependsOnNodeId: "unknown-node" }, // Defect: unknown prereq
    ];

    const report = validatePath({
      nodes,
      edges,
      capstoneMilestones: ["Milestone 1"],
      validSourceIds: ["src-1"],
    });

    assert.equal(report.valid, false);
    assert.ok(report.errors.some((e) => e.includes("Difficulty inversion")));
    assert.ok(report.errors.some((e) => e.includes("has no linked knowledge sources")));
    assert.ok(report.errors.some((e) => e.includes("non-existent prerequisite")));
    assert.ok(report.errors.some((e) => e.includes("Capstone project defines milestones")));
  });

  it("passes validation for a clean, properly ordered path", () => {
    const nodes: GraphNode[] = [
      {
        id: "node-1",
        difficultyLevel: 1,
        sourceIds: ["src-1"],
        projectMilestone: "Milestone 1",
      },
      {
        id: "node-2",
        difficultyLevel: 2,
        sourceIds: ["src-1"],
      },
    ];

    const edges: GraphEdge[] = [{ nodeId: "node-2", dependsOnNodeId: "node-1" }];

    const report = validatePath({
      nodes,
      edges,
      capstoneMilestones: ["Milestone 1"],
      validSourceIds: ["src-1"],
    });

    assert.equal(report.valid, true);
    assert.equal(report.errors.length, 0);
  });
});

export interface GraphNode {
  id: string;
  difficultyLevel: number;
  status?: string;
  sourceIds?: string[];
  projectMilestone?: string;
}

export interface GraphEdge {
  nodeId: string;
  dependsOnNodeId: string;
}

export interface PathValidationReport {
  valid: boolean;
  errors: string[];
}

/**
 * Detects cycles in a directed dependency graph using 3-color DFS (white/gray/black).
 * In this graph, an edge (nodeId -> dependsOnNodeId) means nodeId depends on dependsOnNodeId.
 * A cycle exists if following dependency edges leads back to an ancestor currently in the DFS stack.
 */
export function detectCycle(nodeIds: string[], edges: GraphEdge[]): string[] {
  // Build adjacency list: node -> prerequisites
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    adj.set(id, []);
  }
  for (const edge of edges) {
    const list = adj.get(edge.nodeId);
    if (list) {
      list.push(edge.dependsOnNodeId);
    }
  }

  const color = new Map<string, "white" | "gray" | "black">();
  for (const id of nodeIds) {
    color.set(id, "white");
  }

  const cycles: string[] = [];

  const dfs = (id: string, stack: string[]) => {
    color.set(id, "gray");
    const prereqs = adj.get(id) ?? [];
    for (const prereqId of prereqs) {
      if (!color.has(prereqId)) continue; // Handled as unknown node by path validation
      const c = color.get(prereqId);
      if (c === "gray") {
        cycles.push(`Cycle detected involving: ${[...stack, id, prereqId].join(" -> ")}`);
      } else if (c === "white") {
        dfs(prereqId, [...stack, id]);
      }
    }
    color.set(id, "black");
  };

  for (const id of nodeIds) {
    if (color.get(id) === "white") {
      dfs(id, []);
    }
  }

  return cycles;
}

/**
 * Returns a topological ordering of node IDs (prerequisites before dependents).
 * Throws an Error if a cycle is detected.
 */
export function topoOrder(nodeIds: string[], edges: GraphEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.nodeId) && dependents.has(edge.dependsOnNodeId)) {
      inDegree.set(edge.nodeId, (inDegree.get(edge.nodeId) ?? 0) + 1);
      dependents.get(edge.dependsOnNodeId)?.push(edge.nodeId);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const deps = dependents.get(current) ?? [];
    for (const depId of deps) {
      const remaining = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, remaining);
      if (remaining === 0) {
        queue.push(depId);
      }
    }
  }

  if (result.length !== nodeIds.length) {
    throw new Error("Graph contains a cycle or invalid references, cannot compute topological order.");
  }

  return result;
}

/**
 * Computes which nodes should transition to 'unlocked' or are eligible for learning,
 * based on their prerequisites being completed or mastered.
 */
export function unlockedNodes(
  nodes: { id: string; status: string }[],
  edges: GraphEdge[],
): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const prerequisites = new Map<string, string[]>();

  for (const n of nodes) {
    prerequisites.set(n.id, []);
  }
  for (const edge of edges) {
    prerequisites.get(edge.nodeId)?.push(edge.dependsOnNodeId);
  }

  const isSatisfied = (prereqId: string) => {
    const prereq = nodeMap.get(prereqId);
    return prereq?.status === "completed" || prereq?.status === "mastered_by_placement";
  };

  const unlocked: string[] = [];
  for (const n of nodes) {
    // Already unlocked or completed
    if (n.status === "completed" || n.status === "mastered_by_placement") {
      continue;
    }
    const prereqs = prerequisites.get(n.id) ?? [];
    const allMet = prereqs.every(isSatisfied);
    if (allMet) {
      unlocked.push(n.id);
    }
  }

  return unlocked;
}

/**
 * Validates structural and pedagogical constraints of a candidate learning path DAG:
 * 1. Contains at least one node
 * 2. No cycles
 * 3. Prerequisite difficulty monotonicity (prereq difficulty <= dependent difficulty)
 * 4. Referential integrity: all edge endpoints exist
 * 5. Source grounding: every active node has at least one source (and valid source IDs if provided)
 * 6. Capstone coverage: if capstone milestones exist, at least one node links to a milestone
 */
export function validatePath(params: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  capstoneMilestones?: string[];
  validSourceIds?: string[];
}): PathValidationReport {
  const errors: string[] = [];
  const { nodes, edges, capstoneMilestones = [], validSourceIds } = params;

  if (nodes.length === 0) {
    errors.push("Learning path contains zero nodes.");
    return { valid: false, errors };
  }

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) {
    if (nodeMap.has(n.id)) {
      errors.push(`Duplicate node id: "${n.id}".`);
    }
    nodeMap.set(n.id, n);
  }

  const validSourceSet = validSourceIds ? new Set(validSourceIds) : null;

  // 1. Edge references & Difficulty monotonicity
  for (const edge of edges) {
    const node = nodeMap.get(edge.nodeId);
    const prereq = nodeMap.get(edge.dependsOnNodeId);

    if (!node) {
      errors.push(`Edge references non-existent dependent node "${edge.nodeId}".`);
      continue;
    }
    if (!prereq) {
      errors.push(`Node "${edge.nodeId}" references non-existent prerequisite "${edge.dependsOnNodeId}".`);
      continue;
    }

    if (prereq.difficultyLevel > node.difficultyLevel) {
      errors.push(
        `Difficulty inversion: Prerequisite "${prereq.id}" (tier ${prereq.difficultyLevel}) is harder than dependent node "${node.id}" (tier ${node.difficultyLevel}).`,
      );
    }
  }

  // 2. Cycle detection
  const nodeIds = nodes.map((n) => n.id);
  const cycles = detectCycle(nodeIds, edges);
  errors.push(...cycles);

  // 3. Source grounding
  for (const node of nodes) {
    const sources = node.sourceIds ?? [];
    if (sources.length === 0) {
      errors.push(`Node "${node.id}" has no linked knowledge sources.`);
    } else if (validSourceSet) {
      for (const sid of sources) {
        if (!validSourceSet.has(sid)) {
          errors.push(`Node "${node.id}" references unknown sourceId "${sid}".`);
        }
      }
    }
  }

  // 4. Capstone project milestone linkage
  if (capstoneMilestones.length > 0) {
    const withMilestone = nodes.filter((n) => Boolean(n.projectMilestone && n.projectMilestone.trim()));
    if (withMilestone.length === 0) {
      errors.push("Capstone project defines milestones, but no learning path nodes link to a projectMilestone.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

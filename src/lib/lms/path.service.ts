import { getDb, type Statement } from "@/lib/db";
import type {
  NodeRow,
  NodeEdgeRow,
  CapstoneProject,
  NodeStatus,
} from "./types";
import {
  getSubjectBySlug,
  updateSubjectCapstone,
  listSources,
  listNodes,
  listNodeEdges,
  updateNodesStatus,
  getNodeById,
  updateNodeStatus,
  upsertSpacedRepetition,
  getSpacedRepetition,
} from "./repo";
import { validatePath, unlockedNodes, type GraphEdge } from "./dag";
import { searchRag, type RagSearchResult } from "./rag";
import { putKnowledgeFile } from "./github-knowledge";
import { LMSValidationError } from "./subjects";

export interface LearningPathNodeInput {
  id: string;
  title: string;
  difficultyLevel: number;
  ordinal?: number;
  summary?: string;
  githubMdPath?: string;
  projectMilestone?: string;
  sourceIds?: string[];
  studyGuideMarkdown?: string;
}

export interface DraftLearningPathParams {
  nodes: LearningPathNodeInput[];
  edges: GraphEdge[];
  capstoneProject?: CapstoneProject;
  attemptRound?: number;
}

export interface DraftLearningPathResult {
  valid: boolean;
  pausedForUserPathDecision?: boolean;
  errors?: string[];
  nodes?: NodeRow[];
  edges?: NodeEdgeRow[];
}

export interface NextNodeWithContext {
  node: NodeRow;
  contextChunks: RagSearchResult[];
}

/**
 * Validates and atomically commits a drafted learning path DAG.
 * Enforces cycle freedom, difficulty monotonicity, source grounding, and milestone linkage.
 * Preserves nodes below entry_difficulty_level as mastered_by_placement, unlocks initial entry nodes,
 * writes study guides and capstone specs to GitHub when provided.
 */
export async function draftLearningPath(
  ownerId: string,
  subjectSlug: string,
  params: DraftLearningPathParams,
): Promise<DraftLearningPathResult> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  // 1. Fetch validated sources for source grounding check
  const sources = await listSources(ownerId, subject.id);
  const validatedSources = sources.filter((s) => s.validation_status === "validated");
  const validSourceIds = validatedSources.map((s) => s.id);

  if (validatedSources.length === 0) {
    const isPaused = (params.attemptRound ?? 1) >= 3;
    return {
      valid: false,
      pausedForUserPathDecision: isPaused,
      errors: [
        `Subject "${subjectSlug}" has no validated knowledge sources. Please ingest or upload knowledge sources (via BYOS or research) before drafting a learning path.`,
      ],
    };
  }

  // 2. Structural & pedagogical validation
  const validationReport = validatePath({
    nodes: params.nodes.map((n) => ({
      id: n.id,
      difficultyLevel: n.difficultyLevel,
      sourceIds: n.sourceIds,
      projectMilestone: n.projectMilestone,
    })),
    edges: params.edges,
    capstoneMilestones: params.capstoneProject?.milestones?.map((m) => m.title),
    validSourceIds,
  });

  if (!validationReport.valid) {
    const isPaused = (params.attemptRound ?? 1) >= 3;
    return {
      valid: false,
      pausedForUserPathDecision: isPaused,
      errors: validationReport.errors,
    };
  }

  // 3. Optional Capstone commit & GitHub README
  if (params.capstoneProject) {
    await updateSubjectCapstone(ownerId, subject.id, params.capstoneProject);

    const capstoneReadme = `# ${params.capstoneProject.title}\n\n${params.capstoneProject.description || "Capstone Project Specification"}\n\n## Milestones\n${(params.capstoneProject.milestones ?? []).map((m, idx) => `${idx + 1}. **${m.title}**: ${m.description || ""}`).join("\n")}\n`;
    try {
      await putKnowledgeFile(
        ownerId,
        `lms/${subject.slug}/project/README.md`,
        capstoneReadme,
        `Update capstone project specification for ${subject.slug}`,
      );
    } catch {
      // Non-fatal if GitHub PAT is omitted or offline
    }
  }

  // 4. Save study materials to GitHub if provided
  const preparedNodes = params.nodes.map((n, idx) => ({
    ...n,
    ordinal: n.ordinal && n.ordinal > 0 ? n.ordinal : idx + 1,
  }));
  for (const n of preparedNodes) {
    if (n.studyGuideMarkdown) {
      const ordinalStr = String(n.ordinal ?? 1).padStart(2, "0");
      const mdPath = n.githubMdPath || `lms/${subject.slug}/nodes/node-${ordinalStr}-${n.id}.md`;
      try {
        await putKnowledgeFile(
          ownerId,
          mdPath,
          n.studyGuideMarkdown,
          `Add study guide for node ${n.id}`,
        );
        n.githubMdPath = mdPath;
      } catch {
        // Safe fallback
      }
    }
  }

  // 5. Compute node statuses respecting placement entry level
  const entryLevel = subject.entry_difficulty_level ?? 1;
  const existingNodes = await listNodes(ownerId, subject.id);
  const previouslyCompleted = new Set(
    existingNodes.filter((n) => n.status === "completed").map((n) => n.id),
  );

  const initialStatuses = new Map<string, string>();
  for (const n of preparedNodes) {
    if (previouslyCompleted.has(n.id)) {
      initialStatuses.set(n.id, "completed");
    } else if (n.difficultyLevel < entryLevel) {
      initialStatuses.set(n.id, "mastered_by_placement");
    } else {
      initialStatuses.set(n.id, "locked");
    }
  }

  const prelimGraph = preparedNodes.map((n) => ({
    id: n.id,
    status: initialStatuses.get(n.id)!,
  }));
  const initiallyUnlocked = new Set(unlockedNodes(prelimGraph, params.edges));

  for (const n of preparedNodes) {
    const current = initialStatuses.get(n.id)!;
    if (current === "locked" && initiallyUnlocked.has(n.id)) {
      initialStatuses.set(n.id, "unlocked");
    }
  }

  // 6. DB Transaction: replace edges, upsert nodes, remove deleted nodes
  const db = getDb();
  const statements: Statement[] = [];

  // Delete existing edges
  statements.push({
    text: `delete from lms_node_edges
           where node_id in (select id from lms_nodes where subject_id = $1)
              or depends_on_node_id in (select id from lms_nodes where subject_id = $1)`,
    params: [subject.id],
  });

  // Upsert all nodes
  const preparedNodeIds = preparedNodes.map((n) => n.id);
  for (const n of preparedNodes) {
    const status = initialStatuses.get(n.id)!;
    statements.push({
      text: `insert into lms_nodes (
               id, subject_id, difficulty_level, ordinal, title, summary, github_md_path, project_milestone, status, updated_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             on conflict (id) do update set
               difficulty_level = $3,
               ordinal = $4,
               title = $5,
               summary = $6,
               github_md_path = $7,
               project_milestone = $8,
               status = $9,
               updated_at = now()`,
      params: [
        n.id,
        subject.id,
        n.difficultyLevel,
        n.ordinal ?? 0,
        n.title,
        n.summary ?? "",
        n.githubMdPath ?? "",
        n.projectMilestone ?? "",
        status,
      ],
    });
  }

  // Clean up nodes not in the new draft
  statements.push({
    text: `delete from lms_nodes
           where subject_id = $1 and id not in (${preparedNodeIds.map((_, i) => `$${i + 2}`).join(", ")})`,
    params: [subject.id, ...preparedNodeIds],
  });

  // Insert edges
  for (const edge of params.edges) {
    statements.push({
      text: `insert into lms_node_edges (node_id, depends_on_node_id) values ($1, $2)`,
      params: [edge.nodeId, edge.dependsOnNodeId],
    });
  }

  await db.transaction(statements);

  const savedNodes = await listNodes(ownerId, subject.id);
  const savedEdges = await listNodeEdges(ownerId, subject.id);

  return {
    valid: true,
    nodes: savedNodes,
    edges: savedEdges,
  };
}

/**
 * Returns currently actionable nodes (status 'unlocked' or 'in_progress')
 * paired with top RAG excerpts relevant to their learning objectives.
 */
export async function getNextNodes(
  ownerId: string,
  subjectSlug: string,
): Promise<NextNodeWithContext[]> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new LMSValidationError(`Subject "${subjectSlug}" not found for owner.`);
  }

  const allNodes = await listNodes(ownerId, subject.id);
  const actionable = allNodes.filter(
    (n) => n.status === "unlocked" || n.status === "in_progress",
  );

  const results: NextNodeWithContext[] = [];
  for (const node of actionable) {
    const query = `${node.title} ${node.summary}`.trim();
    let chunks: RagSearchResult[] = [];
    try {
      chunks = await searchRag({
        ownerId,
        subjectSlug,
        query,
        difficultyLevel: node.difficulty_level,
        limit: 3,
      });
    } catch {
      chunks = [];
    }

    results.push({
      node,
      contextChunks: chunks,
    });
  }

  return results;
}

export interface UpdateLearningNodeStatusParams {
  subjectSlug?: string;
  nodeId?: string;
  nodeTitle?: string;
  status: NodeStatus;
}

export interface UpdateLearningNodeStatusResult {
  node: NodeRow;
  newlyUnlockedNodeIds: string[];
}

/**
 * Updates the learning status of a node (e.g. marking it completed or in_progress).
 * Automatically unlocks downstream dependent nodes when completed and schedules spaced repetition review.
 */
export async function updateLearningNodeStatus(
  ownerId: string,
  params: UpdateLearningNodeStatusParams,
): Promise<UpdateLearningNodeStatusResult> {
  const { nodeId, nodeTitle, subjectSlug, status } = params;

  let targetNode: NodeRow | null = null;

  // 1. Direct lookup by nodeId if provided
  if (nodeId) {
    targetNode = await getNodeById(ownerId, nodeId);
  }

  // 2. Lookup within subject if subjectSlug provided
  if (!targetNode && subjectSlug) {
    const subject = await getSubjectBySlug(ownerId, subjectSlug);
    if (subject) {
      const subjectNodes = await listNodes(ownerId, subject.id);
      if (nodeId) {
        const needle = nodeId.trim().toLowerCase();
        targetNode =
          subjectNodes.find((n) => n.id.toLowerCase() === needle) || null;
      }
      if (!targetNode && nodeTitle) {
        const titleNeedle = nodeTitle.trim().toLowerCase();
        targetNode =
          subjectNodes.find((n) => n.title.toLowerCase() === titleNeedle) ||
          subjectNodes.find((n) => n.title.toLowerCase().includes(titleNeedle)) ||
          subjectNodes.find((n) => titleNeedle.includes(n.title.toLowerCase())) ||
          null;
      }
      if (!targetNode && nodeId) {
        const idNeedle = nodeId.trim().toLowerCase();
        targetNode =
          subjectNodes.find((n) => n.title.toLowerCase().includes(idNeedle)) ||
          null;
      }
    }
  }

  // 3. Fallback: search across all owner nodes by ID or Title
  if (!targetNode && (nodeId || nodeTitle)) {
    const searchId = (nodeId || "").trim();
    const searchTitle = (nodeTitle || nodeId || "").trim();
    const rows = await getDb().query(
      `select n.id, n.subject_id, n.difficulty_level, n.ordinal, n.title, n.summary,
              n.github_md_path, n.project_milestone, n.status, n.created_at, n.updated_at
       from lms_nodes n
       join lms_subjects sub on n.subject_id = sub.id
       where sub.owner_id = $1 and (
         lower(n.id) = lower($2) or
         lower(n.title) = lower($3) or
         lower(n.title) like '%' || lower($3) || '%'
       )
       order by n.updated_at desc
       limit 1`,
      [ownerId, searchId, searchTitle],
    );
    if (rows.length > 0) {
      const r = rows[0];
      targetNode = {
        id: String(r.id),
        subject_id: String(r.subject_id),
        difficulty_level: Number(r.difficulty_level),
        ordinal: Number(r.ordinal),
        title: String(r.title),
        summary: r.summary !== null && r.summary !== undefined ? String(r.summary) : "",
        github_md_path: r.github_md_path !== null && r.github_md_path !== undefined ? String(r.github_md_path) : "",
        project_milestone: r.project_milestone !== null && r.project_milestone !== undefined ? String(r.project_milestone) : "",
        status: r.status as NodeStatus,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
      };
    }
  }

  if (!targetNode) {
    throw new LMSValidationError(
      `Learning node not found for identifier "${nodeId || nodeTitle || "unknown"}".`,
    );
  }

  const updatedNode = await updateNodeStatus(ownerId, targetNode.id, status);
  if (!updatedNode) {
    throw new LMSValidationError(`Failed to update node status for "${targetNode.id}".`);
  }

  const newlyUnlockedNodeIds: string[] = [];

  // When completing or mastering a node, compute dependent unlocks and initialize SRS
  if (status === "completed" || status === "mastered_by_placement") {
    const allNodes = await listNodes(ownerId, targetNode.subject_id);
    const allEdges = await listNodeEdges(ownerId, targetNode.subject_id);

    const unlockableIds = unlockedNodes(
      allNodes.map((n) => ({
        id: n.id,
        status: n.id === targetNode.id ? status : n.status,
      })),
      allEdges.map((e) => ({
        nodeId: e.node_id,
        dependsOnNodeId: e.depends_on_node_id,
      })),
    );

    const toUnlock = allNodes.filter(
      (n) => unlockableIds.includes(n.id) && n.status === "locked",
    );

    if (toUnlock.length > 0) {
      const unlockIds = toUnlock.map((n) => n.id);
      await updateNodesStatus(ownerId, targetNode.subject_id, unlockIds, "unlocked");
      newlyUnlockedNodeIds.push(...unlockIds);
    }

    if (status === "completed") {
      const existingSrs = await getSpacedRepetition(ownerId, targetNode.id);
      if (!existingSrs) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await upsertSpacedRepetition(ownerId, targetNode.subject_id, targetNode.id, {
          stability: 2.5,
          difficulty: 2.5,
          reps: 1,
          lapses: 0,
          intervalDays: 1,
          lastReviewedAt: new Date().toISOString(),
          nextReviewAt: tomorrow,
        });
      }
    }
  }

  return {
    node: updatedNode,
    newlyUnlockedNodeIds,
  };
}


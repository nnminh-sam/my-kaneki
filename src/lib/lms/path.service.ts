import { getDb, type Statement } from "@/lib/db";
import type {
  NodeRow,
  NodeEdgeRow,
  CapstoneProject,
} from "./types";
import {
  getSubjectBySlug,
  updateSubjectCapstone,
  listSources,
  listNodes,
  listNodeEdges,
  updateNodesStatus,
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

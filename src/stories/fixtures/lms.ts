// Story fixtures for LMS components. Shapes follow src/lib/lms/types.ts (rows as returned by the repo layer).
import type { NodeRow, NodeStatus, PlacementSessionRow, SubjectRow } from "@/lib/lms/types";

const now = "2026-11-26T08:00:00.000Z";

export const SUBJECT_SLUG = "distributed-systems";

export function node(id: string, title: string, level: number, status: NodeStatus, ordinal = 1): NodeRow {
  return {
    id,
    subject_id: "subj_1",
    difficulty_level: level,
    ordinal,
    title,
    summary: `Core ideas of ${title.toLowerCase()} with worked examples and a hands-on exercise.`,
    github_md_path: `lms/${SUBJECT_SLUG}/modules/${id}.md`,
    project_milestone: `Implement ${title.toLowerCase()} in the capstone key-value store`,
    status,
    created_at: now,
    updated_at: now,
  };
}

export const NODES: NodeRow[] = [
  node("n1", "Time, clocks and ordering", 1, "mastered_by_placement", 1),
  node("n2", "Failure detectors", 2, "completed", 1),
  node("n3", "Leader election", 3, "in_progress", 1),
  node("n4", "Log replication", 4, "unlocked", 1),
  node("n5", "Snapshots & compaction", 5, "locked", 1),
];

export const SUBJECT: SubjectRow = {
  id: "subj_1",
  owner_id: "U-1",
  slug: SUBJECT_SLUG,
  title: "Distributed systems",
  status: "placement",
  difficulty_scale_n: 16,
  entry_difficulty_level: null,
  capstone_project: {
    title: "Build a replicated key-value store",
    description: "A 3-node KV store in TypeScript that survives leader crashes.",
    repoUrl: "https://github.com/example/replicated-kv",
    milestones: [
      { id: "m1", title: "Single-node KV with a write-ahead log", targetNodeId: "n2", completed: true },
      { id: "m2", title: "Leader election across 3 nodes", targetNodeId: "n3", completed: false },
      { id: "m3", title: "Replicated log with majority commit", targetNodeId: "n4", completed: false },
    ],
  },
  created_at: now,
  updated_at: now,
};

export const PLACEMENT_IN_PROGRESS: PlacementSessionRow = {
  id: "pl_1",
  subject_id: "subj_1",
  low_bound: 1,
  high_bound: 16,
  current_mid: 8,
  resolved_level: null,
  status: "in_progress",
  history: [],
  created_at: now,
  updated_at: now,
};

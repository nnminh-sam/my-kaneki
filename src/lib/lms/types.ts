import { z } from "zod";

// ============================================================================
// Enums as const arrays
// ============================================================================

export const SUBJECT_STATUSES = ["researching", "placement", "active", "completed"] as const;
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

export const SOURCE_TRACKS = ["byos", "agent_research"] as const;
export type SourceTrack = (typeof SOURCE_TRACKS)[number];

export const SOURCE_TYPES = ["pdf", "docx", "xlsx", "csv", "markdown", "web_synthesis"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_PERSPECTIVES = ["theory", "practical", "critique", "reference", "mixed"] as const;
export type SourcePerspective = (typeof SOURCE_PERSPECTIVES)[number];

export const SOURCE_VALIDATION_STATUSES = [
  "pending",
  "in_review",
  "validated",
  "escalated_to_user",
  "rejected",
] as const;
export type SourceValidationStatus = (typeof SOURCE_VALIDATION_STATUSES)[number];

export const NODE_STATUSES = [
  "locked",
  "unlocked",
  "in_progress",
  "completed",
  "mastered_by_placement",
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const PLACEMENT_STATUSES = ["in_progress", "completed"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const QUIZ_PURPOSES = ["placement", "mastery_gate", "spaced_repetition"] as const;
export type QuizPurpose = (typeof QUIZ_PURPOSES)[number];

export const QUIZ_MODALITIES = ["mcq_4", "open_ended", "code_challenge", "project_task"] as const;
export type QuizModality = (typeof QUIZ_MODALITIES)[number];

export const RESEARCH_DEBATE_ACTORS = ["research_agent", "validation_agent", "user"] as const;
export type ResearchDebateActor = (typeof RESEARCH_DEBATE_ACTORS)[number];

export const RESEARCH_DEBATE_ACTIONS = [
  "submit_draft",
  "defend_and_revise",
  "accept",
  "raise_issues",
  "user_override_approve",
  "user_reject",
] as const;
export type ResearchDebateAction = (typeof RESEARCH_DEBATE_ACTIONS)[number];

// ============================================================================
// Zod Schemas for JSONB Payloads
// ============================================================================

export const learnerStyleSchema = z.object({
  mode: z.enum(["first_principles", "code_first", "visual", "analogy_heavy"]).optional(),
  pace: z.enum(["leisurely", "standard", "intensive"]).optional(),
  depth: z.enum(["introductory", "intermediate", "deep_mastery"]).optional(),
  notes: z.string().optional(),
});
export type LearnerStyle = z.infer<typeof learnerStyleSchema>;

export const capstoneMilestoneSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  targetNodeId: z.string().optional(),
  completed: z.boolean().default(false),
});
export type CapstoneMilestone = z.infer<typeof capstoneMilestoneSchema>;

export const capstoneProjectSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  repoUrl: z.string().optional(),
  milestones: z.array(capstoneMilestoneSchema).default([]),
});
export type CapstoneProject = z.infer<typeof capstoneProjectSchema>;

export const researchDebateTurnSchema = z.object({
  round: z.number().int().min(0).max(3),
  actor: z.enum(RESEARCH_DEBATE_ACTORS),
  action: z.enum(RESEARCH_DEBATE_ACTIONS),
  summary: z.string(),
  defects: z.array(z.string()).optional(),
  defenseArgument: z.string().optional(),
  citations: z.array(z.string()).optional(),
  timestamp: z.string(),
});
export type ResearchDebateTurn = z.infer<typeof researchDebateTurnSchema>;

export const placementHistoryStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  difficultyTested: z.number().int().positive(),
  quizId: z.string().optional(),
  passed: z.boolean(),
  lowBefore: z.number().int(),
  highBefore: z.number().int(),
  lowAfter: z.number().int(),
  highAfter: z.number().int(),
});
export type PlacementHistoryStep = z.infer<typeof placementHistoryStepSchema>;

export const quizOptionSchema = z.object({
  label: z.enum(["A", "B", "C", "D"]),
  text: z.string(),
});
export type QuizOption = z.infer<typeof quizOptionSchema>;

// Discriminated union for quiz prompts
export const mcqPromptPayloadSchema = z.object({
  type: z.literal("mcq_4"),
  question: z.string(),
  options: z.tuple([quizOptionSchema, quizOptionSchema, quizOptionSchema, quizOptionSchema]),
  correctOption: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().optional(),
});
export type McqPromptPayload = z.infer<typeof mcqPromptPayloadSchema>;

export const openEndedPromptPayloadSchema = z.object({
  type: z.literal("open_ended"),
  prompt: z.string(),
  rubricCriteria: z.array(z.string()).min(1),
  idealAnswerHighlights: z.string().optional(),
});
export type OpenEndedPromptPayload = z.infer<typeof openEndedPromptPayloadSchema>;

export const codeChallengePromptPayloadSchema = z.object({
  type: z.literal("code_challenge"),
  instruction: z.string(),
  starterCode: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  rubricCriteria: z.array(z.string()).optional(),
});
export type CodeChallengePromptPayload = z.infer<typeof codeChallengePromptPayloadSchema>;

export const projectTaskPromptPayloadSchema = z.object({
  type: z.literal("project_task"),
  milestoneTitle: z.string(),
  specification: z.string(),
  checklist: z.array(z.string()).min(1),
  repoTargetFolder: z.string().optional(),
});
export type ProjectTaskPromptPayload = z.infer<typeof projectTaskPromptPayloadSchema>;

export const quizPromptPayloadSchema = z.discriminatedUnion("type", [
  mcqPromptPayloadSchema,
  openEndedPromptPayloadSchema,
  codeChallengePromptPayloadSchema,
  projectTaskPromptPayloadSchema,
]);
export type QuizPromptPayload = z.infer<typeof quizPromptPayloadSchema>;

/**
 * Converts a camelCase, snake_case, or kebab-case string into Title Case.
 * e.g. "scenario1" -> "Scenario 1", "first_scenario" -> "First Scenario"
 */
export function formatKeyToTitle(key: string): string {
  return key
    .replace(/([a-z])([0-9]+)/gi, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Transforms an arbitrary object, array, or serialized JSON value (e.g. scenarios array)
 * into structured, human-readable Markdown.
 */
export function formatPromptToMarkdown(val: unknown, key = "prompt"): string {
  if (typeof val === "string") {
    const trimmed = val.trim();
    // Check if string matches "key: [...]" or "key: {...}"
    const colonMatch = trimmed.match(/^([a-zA-Z0-9_\s]+):\s*(\[[\s\S]*\]|\{[\s\S]*\})$/);
    if (colonMatch) {
      try {
        const parsed = JSON.parse(colonMatch[2]);
        return formatPromptToMarkdown(parsed, colonMatch[1]);
      } catch {
        // Not valid JSON, continue
      }
    }

    // Check if entire string is JSON array or object
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatPromptToMarkdown(parsed, key);
      } catch {
        // Not valid JSON, continue
      }
    }

    if (
      key === "prompt" ||
      key === "question" ||
      key === "instruction" ||
      key === "specification" ||
      !key
    ) {
      return val;
    }

    const title = formatKeyToTitle(key);
    return `### ${title}\n${val}`;
  }

  if (Array.isArray(val)) {
    const title = formatKeyToTitle(key);
    const singularTitle = title ? title.replace(/s$/i, "") : "Scenario";
    const formattedItems = val.map((item, idx) => {
      if (typeof item === "string") {
        return `${idx + 1}. ${item}`;
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const parts: string[] = [];
        if (obj.title) parts.push(`**${String(obj.title)}**`);
        if (obj.context) parts.push(`**Context**: ${String(obj.context)}`);
        if (obj.scenario) parts.push(`**Scenario**: ${String(obj.scenario)}`);
        if (obj.description) parts.push(`${String(obj.description)}`);
        if (obj.question) parts.push(`**Question**: ${String(obj.question)}`);
        if (obj.prompt) parts.push(`**Question**: ${String(obj.prompt)}`);
        if (obj.task) parts.push(`**Task**: ${String(obj.task)}`);

        if (parts.length === 0) {
          for (const [k, v] of Object.entries(obj)) {
            parts.push(
              `**${formatKeyToTitle(k)}**: ${
                typeof v === "object" ? JSON.stringify(v) : String(v)
              }`,
            );
          }
        }
        const itemHeading = obj.title
          ? `### ${String(obj.title)}`
          : `### ${singularTitle} ${idx + 1}`;
        return `${itemHeading}\n\n${parts.join("\n\n")}`;
      }
      return `${idx + 1}. ${String(item)}`;
    });

    return formattedItems.join("\n\n");
  }

  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      parts.push(formatPromptToMarkdown(v, k));
    }
    return parts.join("\n\n");
  }

  return `${formatKeyToTitle(key)}: ${String(val)}`;
}

/**
 * Gracefully normalizes raw model promptPayload arguments into a strictly valid QuizPromptPayload.
 * Resolves missing type discriminators, formats unstructured scenario objects into open_ended prompts,
 * normalizes MCQ option records/arrays into 4-tuples, and provides sensible rubric criteria fallbacks.
 */
export function normalizeQuizPromptPayload(
  quizType: string,
  raw: Record<string, unknown>,
): QuizPromptPayload {
  const payload: Record<string, unknown> = { ...(raw || {}) };
  payload.type = raw?.type || quizType;

  if (payload.type === "open_ended") {
    if (!payload.prompt || typeof payload.prompt !== "string") {
      const fieldParts: string[] = [];
      for (const [key, val] of Object.entries(raw || {})) {
        if (key === "type" || key === "rubricCriteria" || key === "idealAnswerHighlights") continue;
        const formatted = formatPromptToMarkdown(val, key);
        if (formatted) fieldParts.push(formatted);
      }
      payload.prompt = fieldParts.length > 0 ? fieldParts.join("\n\n") : "Explain and justify your answer.";
    } else {
      payload.prompt = formatPromptToMarkdown(payload.prompt);
    }

    if (!Array.isArray(payload.rubricCriteria) || payload.rubricCriteria.length === 0) {
      payload.rubricCriteria = [
        "Correctness of conceptual understanding",
        "Technical and architectural justification",
        "Appropriate complexity trade-off analysis",
      ];
    }
  } else if (payload.type === "mcq_4") {
    if (!payload.question && typeof raw?.prompt === "string") {
      payload.question = raw.prompt;
    }
    if (!payload.question) {
      payload.question = "Select the best option:";
    } else {
      payload.question = formatPromptToMarkdown(payload.question);
    }

    const rawOptions = raw?.options;
    const labels: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

    if (Array.isArray(rawOptions)) {
      if (rawOptions.length >= 4 && typeof rawOptions[0] === "string") {
        payload.options = labels.map((lbl, idx) => ({
          label: lbl,
          text: String(rawOptions[idx] ?? ""),
        }));
      } else if (rawOptions.length >= 4 && typeof rawOptions[0] === "object") {
        payload.options = labels.map((lbl, idx) => {
          const item = rawOptions[idx] as any;
          return {
            label: lbl,
            text: String(item?.text ?? item?.label ?? ""),
          };
        });
      }
    } else if (rawOptions && typeof rawOptions === "object") {
      payload.options = labels.map((lbl) => ({
        label: lbl,
        text: String((rawOptions as Record<string, unknown>)[lbl] ?? ""),
      }));
    }

    if (!payload.options || !Array.isArray(payload.options) || payload.options.length !== 4) {
      payload.options = [
        { label: "A", text: "Option A" },
        { label: "B", text: "Option B" },
        { label: "C", text: "Option C" },
        { label: "D", text: "Option D" },
      ];
    }

    if (!payload.correctOption || !["A", "B", "C", "D"].includes(String(payload.correctOption))) {
      payload.correctOption = "A";
    }
  } else if (payload.type === "code_challenge") {
    if (!payload.instruction) {
      payload.instruction = String(raw?.prompt || raw?.question || "Implement the solution satisfying the requirements.");
    }
    payload.instruction = formatPromptToMarkdown(payload.instruction);
  } else if (payload.type === "project_task") {
    if (!payload.milestoneTitle) {
      payload.milestoneTitle = String(raw?.title || "Project Milestone");
    }
    if (!payload.specification) {
      payload.specification = String(raw?.prompt || raw?.description || "Complete the project task specification.");
    }
    payload.specification = formatPromptToMarkdown(payload.specification);
    if (!Array.isArray(payload.checklist) || payload.checklist.length === 0) {
      payload.checklist = ["Core requirements implemented", "Verification tests pass"];
    }
  }

  return quizPromptPayloadSchema.parse(payload);
}

// Discriminated union for quiz submissions
export const mcqSubmissionSchema = z.object({
  type: z.literal("mcq_4"),
  selectedOption: z.enum(["A", "B", "C", "D"]),
});
export type McqSubmission = z.infer<typeof mcqSubmissionSchema>;

export const openEndedSubmissionSchema = z.object({
  type: z.literal("open_ended"),
  response: z.string().min(1),
});
export type OpenEndedSubmission = z.infer<typeof openEndedSubmissionSchema>;

export const codeChallengeSubmissionSchema = z.object({
  type: z.literal("code_challenge"),
  code: z.string().min(1),
  language: z.string().optional(),
});
export type CodeChallengeSubmission = z.infer<typeof codeChallengeSubmissionSchema>;

export const projectTaskSubmissionSchema = z.object({
  type: z.literal("project_task"),
  completedChecklistIndices: z.array(z.number().int().nonnegative()),
  commitUrl: z.string().optional(),
  notes: z.string().optional(),
});
export type ProjectTaskSubmission = z.infer<typeof projectTaskSubmissionSchema>;

export const quizSubmissionSchema = z.discriminatedUnion("type", [
  mcqSubmissionSchema,
  openEndedSubmissionSchema,
  codeChallengeSubmissionSchema,
  projectTaskSubmissionSchema,
]);
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;

// ============================================================================
// Database Row Interfaces
// ============================================================================

export interface LearnerProfileRow {
  owner_id: string;
  learning_style: LearnerStyle;
  preferred_languages: string;
  created_at: string;
  updated_at: string;
}

export interface SubjectRow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  status: SubjectStatus;
  difficulty_scale_n: number;
  entry_difficulty_level: number | null;
  capstone_project: CapstoneProject;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  subject_id: string;
  track: SourceTrack;
  source_type: SourceType;
  title: string;
  original_uri: string;
  github_md_path: string;
  perspective: SourcePerspective;
  validation_status: SourceValidationStatus;
  review_round: number;
  debate_history: ResearchDebateTurn[];
  file_sha: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface NodeRow {
  id: string;
  subject_id: string;
  difficulty_level: number;
  ordinal: number;
  title: string;
  summary: string;
  github_md_path: string;
  project_milestone: string;
  status: NodeStatus;
  created_at: string;
  updated_at: string;
}

export interface NodeEdgeRow {
  node_id: string;
  depends_on_node_id: string;
  created_at: string;
}

export interface RagChunkRow {
  id: string;
  subject_id: string;
  source_id: string;
  node_id: string | null;
  github_md_path: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PlacementSessionRow {
  id: string;
  subject_id: string;
  low_bound: number;
  high_bound: number;
  current_mid: number;
  resolved_level: number | null;
  status: PlacementStatus;
  history: PlacementHistoryStep[];
  created_at: string;
  updated_at: string;
}

export interface QuizRow {
  id: string;
  subject_id: string;
  node_id: string | null;
  placement_session_id: string | null;
  quiz_purpose: QuizPurpose;
  quiz_type: QuizModality;
  difficulty_level: number;
  prompt_payload: QuizPromptPayload;
  user_submission: QuizSubmission | null;
  passed: boolean | null;
  score: number | null;
  agent_feedback: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SpacedRepetitionRow {
  node_id: string;
  owner_id: string;
  subject_id: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  interval_days: number;
  last_reviewed_at: string | null;
  next_review_at: string;
  created_at: string;
  updated_at: string;
}

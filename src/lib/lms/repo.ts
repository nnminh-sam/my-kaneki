import { randomUUID } from "node:crypto";
import { getDb, type Db, type Row } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type {
  LearnerProfileRow,
  LearnerStyle,
  SubjectRow,
  SubjectStatus,
  SourceRow,
  SourceTrack,
  SourceType,
  SourcePerspective,
  SourceValidationStatus,
  ResearchDebateTurn,
  NodeRow,
  NodeStatus,
  NodeEdgeRow,
  PlacementSessionRow,
  PlacementStatus,
  PlacementHistoryStep,
  QuizRow,
  QuizPurpose,
  QuizModality,
  QuizPromptPayload,
  QuizSubmission,
  SpacedRepetitionRow,
  CapstoneProject,
} from "./types";

function mapProfile(row: Row): LearnerProfileRow {
  return {
    owner_id: String(row.owner_id),
    learning_style: (row.learning_style ?? {}) as LearnerStyle,
    preferred_languages: String(row.preferred_languages ?? ""),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapSubject(row: Row): SubjectRow {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    slug: String(row.slug),
    title: String(row.title),
    status: row.status as SubjectStatus,
    difficulty_scale_n: Number(row.difficulty_scale_n),
    entry_difficulty_level: row.entry_difficulty_level !== null ? Number(row.entry_difficulty_level) : null,
    capstone_project: (row.capstone_project ?? {}) as CapstoneProject,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapSource(row: Row): SourceRow {
  return {
    id: String(row.id),
    subject_id: String(row.subject_id),
    track: row.track as SourceTrack,
    source_type: row.source_type as SourceType,
    title: String(row.title ?? ""),
    original_uri: String(row.original_uri ?? ""),
    github_md_path: String(row.github_md_path ?? ""),
    perspective: row.perspective as SourcePerspective,
    validation_status: row.validation_status as SourceValidationStatus,
    review_round: Number(row.review_round ?? 0),
    debate_history: (row.debate_history ?? []) as ResearchDebateTurn[],
    file_sha: String(row.file_sha ?? ""),
    content_hash: String(row.content_hash ?? ""),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapNode(row: Row): NodeRow {
  return {
    id: String(row.id),
    subject_id: String(row.subject_id),
    difficulty_level: Number(row.difficulty_level),
    ordinal: Number(row.ordinal ?? 0),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    github_md_path: String(row.github_md_path ?? ""),
    project_milestone: String(row.project_milestone ?? ""),
    status: row.status as NodeStatus,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapPlacementSession(row: Row): PlacementSessionRow {
  return {
    id: String(row.id),
    subject_id: String(row.subject_id),
    low_bound: Number(row.low_bound),
    high_bound: Number(row.high_bound),
    current_mid: Number(row.current_mid),
    resolved_level: row.resolved_level !== null ? Number(row.resolved_level) : null,
    status: row.status as PlacementStatus,
    history: (row.history ?? []) as PlacementHistoryStep[],
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapQuiz(row: Row): QuizRow {
  return {
    id: String(row.id),
    subject_id: String(row.subject_id),
    node_id: row.node_id ? String(row.node_id) : null,
    placement_session_id: row.placement_session_id ? String(row.placement_session_id) : null,
    quiz_purpose: row.quiz_purpose as QuizPurpose,
    quiz_type: row.quiz_type as QuizModality,
    difficulty_level: Number(row.difficulty_level),
    prompt_payload: (row.prompt_payload ?? {}) as QuizPromptPayload,
    user_submission: (row.user_submission ?? null) as QuizSubmission | null,
    passed: row.passed !== null ? Boolean(row.passed) : null,
    score: row.score !== null ? Number(row.score) : null,
    agent_feedback: row.agent_feedback ? String(row.agent_feedback) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    completed_at: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : null,
  };
}

function mapSpacedRepetition(row: Row): SpacedRepetitionRow {
  return {
    node_id: String(row.node_id),
    owner_id: String(row.owner_id),
    subject_id: String(row.subject_id),
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    interval_days: Number(row.interval_days),
    last_reviewed_at: row.last_reviewed_at ? (row.last_reviewed_at instanceof Date ? row.last_reviewed_at.toISOString() : String(row.last_reviewed_at)) : null,
    next_review_at: row.next_review_at instanceof Date ? row.next_review_at.toISOString() : String(row.next_review_at),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// ============================================================================
// 1. Learner Profile
// ============================================================================

export async function upsertProfile(
  ownerId: string,
  profile: { learningStyle?: LearnerStyle; preferredLanguages?: string },
): Promise<LearnerProfileRow> {
  const db = getDb();
  const rows = await db.query(
    `insert into lms_learner_profiles (owner_id, learning_style, preferred_languages, updated_at)
     values ($1, $2::jsonb, $3, now())
     on conflict (owner_id) do update
     set learning_style = coalesce($2::jsonb, lms_learner_profiles.learning_style),
         preferred_languages = coalesce($3, lms_learner_profiles.preferred_languages),
         updated_at = now()
     returning owner_id, learning_style, preferred_languages, created_at, updated_at`,
    [
      ownerId,
      profile.learningStyle ? JSON.stringify(profile.learningStyle) : "{}",
      profile.preferredLanguages ?? "",
    ],
  );

  await recordAudit({
    action: "lms.profile.upsert",
    entityType: "lms_profile",
    entityId: ownerId,
    actor: "user",
    payload: { learningStyle: profile.learningStyle, preferredLanguages: profile.preferredLanguages },
  });

  return mapProfile(rows[0]);
}

export async function getProfile(ownerId: string): Promise<LearnerProfileRow | null> {
  const rows = await getDb().query(
    `select owner_id, learning_style, preferred_languages, created_at, updated_at
     from lms_learner_profiles where owner_id = $1`,
    [ownerId],
  );
  return rows.length > 0 ? mapProfile(rows[0]) : null;
}

// ============================================================================
// 2. Subjects
// ============================================================================

export async function createSubject(
  ownerId: string,
  params: {
    slug: string;
    title: string;
    difficultyScaleN?: number;
    capstoneProject?: CapstoneProject;
  },
): Promise<SubjectRow> {
  const db = getDb();
  const id = `subj_${randomUUID().replace(/-/g, "")}`;
  const scale = params.difficultyScaleN ?? 16;
  const capstone = params.capstoneProject ?? { title: "", description: "", milestones: [] };

  const rows = await db.query(
    `insert into lms_subjects (id, owner_id, slug, title, difficulty_scale_n, capstone_project)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     returning id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at`,
    [id, ownerId, params.slug, params.title, scale, JSON.stringify(capstone)],
  );

  const subject = mapSubject(rows[0]);
  await recordAudit({
    action: "lms.subject.create",
    entityType: "lms_subject",
    entityId: subject.id,
    actor: "user",
    payload: { slug: subject.slug, title: subject.title },
  });

  return subject;
}

export async function getSubjectBySlug(ownerId: string, slug: string): Promise<SubjectRow | null> {
  const rows = await getDb().query(
    `select id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at
     from lms_subjects where owner_id = $1 and slug = $2`,
    [ownerId, slug],
  );
  return rows.length > 0 ? mapSubject(rows[0]) : null;
}

export async function getSubjectById(ownerId: string, id: string): Promise<SubjectRow | null> {
  const rows = await getDb().query(
    `select id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at
     from lms_subjects where owner_id = $1 and id = $2`,
    [ownerId, id],
  );
  return rows.length > 0 ? mapSubject(rows[0]) : null;
}

export async function listSubjects(ownerId: string): Promise<SubjectRow[]> {
  const rows = await getDb().query(
    `select id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at
     from lms_subjects where owner_id = $1 order by updated_at desc, id desc`,
    [ownerId],
  );
  return rows.map(mapSubject);
}

export async function updateSubjectStatus(
  ownerId: string,
  subjectId: string,
  status: SubjectStatus,
  entryDifficultyLevel?: number | null,
): Promise<SubjectRow | null> {
  const rows = await getDb().query(
    `update lms_subjects
     set status = $3,
         entry_difficulty_level = coalesce($4, entry_difficulty_level),
         updated_at = now()
     where id = $1 and owner_id = $2
     returning id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at`,
    [subjectId, ownerId, status, entryDifficultyLevel ?? null],
  );

  if (rows.length === 0) return null;
  const subject = mapSubject(rows[0]);
  await recordAudit({
    action: "lms.subject.update_status",
    entityType: "lms_subject",
    entityId: subject.id,
    actor: "user",
    payload: { status, entryDifficultyLevel },
  });

  return subject;
}

export async function updateSubjectCapstone(
  ownerId: string,
  subjectId: string,
  capstone: CapstoneProject,
): Promise<SubjectRow | null> {
  const rows = await getDb().query(
    `update lms_subjects
     set capstone_project = $3::jsonb,
         updated_at = now()
     where id = $1 and owner_id = $2
     returning id, owner_id, slug, title, status, difficulty_scale_n, entry_difficulty_level, capstone_project, created_at, updated_at`,
    [subjectId, ownerId, JSON.stringify(capstone)],
  );
  if (rows.length === 0) return null;
  return mapSubject(rows[0]);
}

// ============================================================================
// 3. Sources
// ============================================================================

export async function createSource(
  ownerId: string,
  subjectId: string,
  source: {
    id?: string;
    track: SourceTrack;
    sourceType: SourceType;
    title: string;
    originalUri?: string;
    githubMdPath?: string;
    perspective?: SourcePerspective;
    validationStatus?: SourceValidationStatus;
    reviewRound?: number;
    debateHistory?: ResearchDebateTurn[];
    fileSha?: string;
    contentHash?: string;
  },
): Promise<SourceRow> {
  const db = getDb();
  // Ensure subject belongs to ownerId
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const id = source.id ?? `src_${randomUUID().replace(/-/g, "")}`;
  const rows = await db.query(
    `insert into lms_sources (
       id, subject_id, track, source_type, title, original_uri, github_md_path,
       perspective, validation_status, review_round, debate_history, file_sha, content_hash
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [
      id,
      subjectId,
      source.track,
      source.sourceType,
      source.title,
      source.originalUri ?? "",
      source.githubMdPath ?? "",
      source.perspective ?? "mixed",
      source.validationStatus ?? "pending",
      source.reviewRound ?? 0,
      JSON.stringify(source.debateHistory ?? []),
      source.fileSha ?? "",
      source.contentHash ?? "",
    ],
  );

  const res = mapSource(rows[0]);
  await recordAudit({
    action: "lms.source.create",
    entityType: "lms_source",
    entityId: res.id,
    actor: "user",
    payload: { subjectId, track: res.track, title: res.title },
  });

  return res;
}

export async function getSourceById(ownerId: string, sourceId: string): Promise<SourceRow | null> {
  const rows = await getDb().query(
    `select s.id, s.subject_id, s.track, s.source_type, s.title, s.original_uri, s.github_md_path,
            s.perspective, s.validation_status, s.review_round, s.debate_history, s.file_sha, s.content_hash,
            s.created_at, s.updated_at
     from lms_sources s
     join lms_subjects sub on s.subject_id = sub.id
     where s.id = $1 and sub.owner_id = $2`,
    [sourceId, ownerId],
  );
  return rows.length > 0 ? mapSource(rows[0]) : null;
}

export async function listSources(ownerId: string, subjectId: string): Promise<SourceRow[]> {
  const rows = await getDb().query(
    `select s.id, s.subject_id, s.track, s.source_type, s.title, s.original_uri, s.github_md_path,
            s.perspective, s.validation_status, s.review_round, s.debate_history, s.file_sha, s.content_hash,
            s.created_at, s.updated_at
     from lms_sources s
     join lms_subjects sub on s.subject_id = sub.id
     where s.subject_id = $1 and sub.owner_id = $2
     order by s.created_at asc`,
    [subjectId, ownerId],
  );
  return rows.map(mapSource);
}

export async function updateSourceStatus(
  ownerId: string,
  sourceId: string,
  status: SourceValidationStatus,
  reviewRound?: number,
  debateHistory?: ResearchDebateTurn[],
): Promise<SourceRow | null> {
  // Ensure ownership
  const existing = await getSourceById(ownerId, sourceId);
  if (!existing) return null;

  const rows = await getDb().query(
    `update lms_sources
     set validation_status = $2,
         review_round = coalesce($3, review_round),
         debate_history = coalesce($4::jsonb, debate_history),
         updated_at = now()
     where id = $1
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [sourceId, status, reviewRound ?? null, debateHistory ? JSON.stringify(debateHistory) : null],
  );

  return rows.length > 0 ? mapSource(rows[0]) : null;
}

// ============================================================================
// 4. Nodes and Dependency Edges
// ============================================================================

export async function createNode(
  ownerId: string,
  subjectId: string,
  node: {
    id?: string;
    difficultyLevel: number;
    ordinal?: number;
    title: string;
    summary?: string;
    githubMdPath?: string;
    projectMilestone?: string;
    status?: NodeStatus;
  },
): Promise<NodeRow> {
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const id = node.id ?? `node_${randomUUID().replace(/-/g, "")}`;
  const rows = await getDb().query(
    `insert into lms_nodes (
       id, subject_id, difficulty_level, ordinal, title, summary, github_md_path, project_milestone, status
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, subject_id, difficulty_level, ordinal, title, summary, github_md_path, project_milestone, status,
               created_at, updated_at`,
    [
      id,
      subjectId,
      node.difficultyLevel,
      node.ordinal ?? 0,
      node.title,
      node.summary ?? "",
      node.githubMdPath ?? "",
      node.projectMilestone ?? "",
      node.status ?? "locked",
    ],
  );

  return mapNode(rows[0]);
}

export async function listNodes(ownerId: string, subjectId: string): Promise<NodeRow[]> {
  const rows = await getDb().query(
    `select n.id, n.subject_id, n.difficulty_level, n.ordinal, n.title, n.summary,
            n.github_md_path, n.project_milestone, n.status, n.created_at, n.updated_at
     from lms_nodes n
     join lms_subjects sub on n.subject_id = sub.id
     where n.subject_id = $1 and sub.owner_id = $2
     order by n.difficulty_level asc, n.ordinal asc, n.id asc`,
    [subjectId, ownerId],
  );
  return rows.map(mapNode);
}

export async function getNodeById(ownerId: string, nodeId: string): Promise<NodeRow | null> {
  const rows = await getDb().query(
    `select n.id, n.subject_id, n.difficulty_level, n.ordinal, n.title, n.summary,
            n.github_md_path, n.project_milestone, n.status, n.created_at, n.updated_at
     from lms_nodes n
     join lms_subjects sub on n.subject_id = sub.id
     where n.id = $1 and sub.owner_id = $2`,
    [nodeId, ownerId],
  );
  return rows.length > 0 ? mapNode(rows[0]) : null;
}

export async function updateNodeStatus(
  ownerId: string,
  nodeId: string,
  status: NodeStatus,
): Promise<NodeRow | null> {
  const existing = await getNodeById(ownerId, nodeId);
  if (!existing) return null;

  const rows = await getDb().query(
    `update lms_nodes
     set status = $2, updated_at = now()
     where id = $1
     returning id, subject_id, difficulty_level, ordinal, title, summary,
               github_md_path, project_milestone, status, created_at, updated_at`,
    [nodeId, status],
  );

  return rows.length > 0 ? mapNode(rows[0]) : null;
}

export async function updateNodesStatus(
  ownerId: string,
  subjectId: string,
  nodeIds: string[],
  status: NodeStatus,
): Promise<NodeRow[]> {
  if (nodeIds.length === 0) return [];
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const rows = await getDb().query(
    `update lms_nodes
     set status = $1, updated_at = now()
     where subject_id = $2 and id = any($3)
     returning id, subject_id, difficulty_level, ordinal, title, summary,
               github_md_path, project_milestone, status, created_at, updated_at`,
    [status, subjectId, nodeIds],
  );

  return rows.map(mapNode);
}

export async function setNodeEdges(
  ownerId: string,
  subjectId: string,
  edges: { nodeId: string; dependsOnNodeId: string }[],
): Promise<void> {
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const statements = [
    {
      text: `delete from lms_node_edges
             where node_id in (select id from lms_nodes where subject_id = $1)`,
      params: [subjectId],
    },
    ...edges.map((e) => ({
      text: `insert into lms_node_edges (node_id, depends_on_node_id) values ($1, $2)
             on conflict do nothing`,
      params: [e.nodeId, e.dependsOnNodeId],
    })),
  ];

  await getDb().transaction(statements);
}

export async function listNodeEdges(
  ownerId: string,
  subjectId: string,
): Promise<NodeEdgeRow[]> {
  const rows = await getDb().query(
    `select e.node_id, e.depends_on_node_id, e.created_at
     from lms_node_edges e
     join lms_nodes n on e.node_id = n.id
     join lms_subjects sub on n.subject_id = sub.id
     where n.subject_id = $1 and sub.owner_id = $2`,
    [subjectId, ownerId],
  );

  return rows.map((r) => ({
    node_id: String(r.node_id),
    depends_on_node_id: String(r.depends_on_node_id),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

// ============================================================================
// 5. Placement Sessions
// ============================================================================

export async function createPlacementSession(
  ownerId: string,
  subjectId: string,
  params: { lowBound?: number; highBound: number; currentMid: number },
): Promise<PlacementSessionRow> {
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const id = `pl_${randomUUID().replace(/-/g, "")}`;
  const rows = await getDb().query(
    `insert into lms_placement_sessions (id, subject_id, low_bound, high_bound, current_mid, status, history)
     values ($1, $2, $3, $4, $5, 'in_progress', '[]'::jsonb)
     returning id, subject_id, low_bound, high_bound, current_mid, resolved_level, status, history, created_at, updated_at`,
    [id, subjectId, params.lowBound ?? 1, params.highBound, params.currentMid],
  );

  return mapPlacementSession(rows[0]);
}

export async function getPlacementSession(
  ownerId: string,
  sessionId: string,
): Promise<PlacementSessionRow | null> {
  const rows = await getDb().query(
    `select p.id, p.subject_id, p.low_bound, p.high_bound, p.current_mid, p.resolved_level, p.status, p.history,
            p.created_at, p.updated_at
     from lms_placement_sessions p
     join lms_subjects sub on p.subject_id = sub.id
     where p.id = $1 and sub.owner_id = $2`,
    [sessionId, ownerId],
  );
  return rows.length > 0 ? mapPlacementSession(rows[0]) : null;
}

export async function updatePlacementStep(
  ownerId: string,
  sessionId: string,
  update: {
    lowBound: number;
    highBound: number;
    currentMid: number;
    resolvedLevel?: number | null;
    status?: PlacementStatus;
    history: PlacementHistoryStep[];
  },
): Promise<PlacementSessionRow | null> {
  const existing = await getPlacementSession(ownerId, sessionId);
  if (!existing) return null;

  const rows = await getDb().query(
    `update lms_placement_sessions
     set low_bound = $2,
         high_bound = $3,
         current_mid = $4,
         resolved_level = coalesce($5, resolved_level),
         status = coalesce($6, status),
         history = $7::jsonb,
         updated_at = now()
     where id = $1
     returning id, subject_id, low_bound, high_bound, current_mid, resolved_level, status, history, created_at, updated_at`,
    [
      sessionId,
      update.lowBound,
      update.highBound,
      update.currentMid,
      update.resolvedLevel ?? null,
      update.status ?? null,
      JSON.stringify(update.history),
    ],
  );

  return rows.length > 0 ? mapPlacementSession(rows[0]) : null;
}

// ============================================================================
// 6. Quizzes
// ============================================================================

export async function createQuiz(
  ownerId: string,
  subjectId: string,
  quiz: {
    id?: string;
    nodeId?: string | null;
    placementSessionId?: string | null;
    quizPurpose: QuizPurpose;
    quizType: QuizModality;
    difficultyLevel: number;
    promptPayload: QuizPromptPayload;
  },
): Promise<QuizRow> {
  const subj = await getSubjectById(ownerId, subjectId);
  if (!subj) {
    throw new Error(`Subject "${subjectId}" not found for owner`);
  }

  const id = quiz.id ?? `quiz_${randomUUID().replace(/-/g, "")}`;
  const rows = await getDb().query(
    `insert into lms_quizzes (
       id, subject_id, node_id, placement_session_id, quiz_purpose, quiz_type, difficulty_level, prompt_payload
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id, subject_id, node_id, placement_session_id, quiz_purpose, quiz_type, difficulty_level,
               prompt_payload, user_submission, passed, score, agent_feedback, created_at, completed_at`,
    [
      id,
      subjectId,
      quiz.nodeId ?? null,
      quiz.placementSessionId ?? null,
      quiz.quizPurpose,
      quiz.quizType,
      quiz.difficultyLevel,
      JSON.stringify(quiz.promptPayload),
    ],
  );

  return mapQuiz(rows[0]);
}

export async function getQuizById(ownerId: string, quizId: string): Promise<QuizRow | null> {
  const rows = await getDb().query(
    `select q.id, q.subject_id, q.node_id, q.placement_session_id, q.quiz_purpose, q.quiz_type, q.difficulty_level,
            q.prompt_payload, q.user_submission, q.passed, q.score, q.agent_feedback, q.created_at, q.completed_at
     from lms_quizzes q
     join lms_subjects sub on q.subject_id = sub.id
     where q.id = $1 and sub.owner_id = $2`,
    [quizId, ownerId],
  );
  return rows.length > 0 ? mapQuiz(rows[0]) : null;
}

export async function submitQuizResult(
  ownerId: string,
  quizId: string,
  result: {
    userSubmission: QuizSubmission;
    passed: boolean;
    score: number;
    agentFeedback?: string;
  },
): Promise<QuizRow | null> {
  const existing = await getQuizById(ownerId, quizId);
  if (!existing) return null;

  const rows = await getDb().query(
    `update lms_quizzes
     set user_submission = $2::jsonb,
         passed = $3,
         score = $4,
         agent_feedback = $5,
         completed_at = now()
     where id = $1
     returning id, subject_id, node_id, placement_session_id, quiz_purpose, quiz_type, difficulty_level,
               prompt_payload, user_submission, passed, score, agent_feedback, created_at, completed_at`,
    [
      quizId,
      JSON.stringify(result.userSubmission),
      result.passed,
      result.score,
      result.agentFeedback ?? null,
    ],
  );

  return rows.length > 0 ? mapQuiz(rows[0]) : null;
}

export async function listQuizzesForSubject(
  ownerId: string,
  subjectId: string,
  purpose?: QuizPurpose,
): Promise<QuizRow[]> {
  const whereClauses = ["q.subject_id = $1", "sub.owner_id = $2"];
  const params: unknown[] = [subjectId, ownerId];
  if (purpose) {
    params.push(purpose);
    whereClauses.push(`q.quiz_purpose = $${params.length}`);
  }
  const rows = await getDb().query(
    `select q.id, q.subject_id, q.node_id, q.placement_session_id, q.quiz_purpose, q.quiz_type, q.difficulty_level,
            q.prompt_payload, q.user_submission, q.passed, q.score, q.agent_feedback, q.created_at, q.completed_at
     from lms_quizzes q
     join lms_subjects sub on q.subject_id = sub.id
     where ${whereClauses.join(" and ")}
     order by q.difficulty_level asc, q.created_at desc`,
    params,
  );
  return rows.map(mapQuiz);
}

export async function getPendingQuizForNode(
  ownerId: string,
  nodeId: string,
  purpose: QuizPurpose,
): Promise<QuizRow | null> {
  const rows = await getDb().query(
    `select q.id, q.subject_id, q.node_id, q.placement_session_id, q.quiz_purpose, q.quiz_type, q.difficulty_level,
            q.prompt_payload, q.user_submission, q.passed, q.score, q.agent_feedback, q.created_at, q.completed_at
     from lms_quizzes q
     join lms_subjects sub on q.subject_id = sub.id
     where q.node_id = $1 and sub.owner_id = $2 and q.quiz_purpose = $3 and q.completed_at is null
     order by q.created_at desc
     limit 1`,
    [nodeId, ownerId, purpose],
  );
  return rows.length > 0 ? mapQuiz(rows[0]) : null;
}

// ============================================================================
// 7. Spaced Repetition
// ============================================================================

export async function upsertSpacedRepetition(
  ownerId: string,
  subjectId: string,
  nodeId: string,
  srs: {
    stability?: number;
    difficulty?: number;
    reps: number;
    lapses: number;
    intervalDays: number;
    lastReviewedAt?: string | null;
    nextReviewAt: string;
  },
): Promise<SpacedRepetitionRow> {
  const rows = await getDb().query(
    `insert into lms_spaced_repetition (
       node_id, owner_id, subject_id, stability, difficulty, reps, lapses, interval_days, last_reviewed_at, next_review_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (node_id) do update
     set stability = $4,
         difficulty = $5,
         reps = $6,
         lapses = $7,
         interval_days = $8,
         last_reviewed_at = $9,
         next_review_at = $10,
         updated_at = now()
     returning node_id, owner_id, subject_id, stability, difficulty, reps, lapses, interval_days,
               last_reviewed_at, next_review_at, created_at, updated_at`,
    [
      nodeId,
      ownerId,
      subjectId,
      srs.stability ?? 1.0,
      srs.difficulty ?? 2.5,
      srs.reps,
      srs.lapses,
      srs.intervalDays,
      srs.lastReviewedAt ? new Date(srs.lastReviewedAt) : null,
      new Date(srs.nextReviewAt),
    ],
  );

  return mapSpacedRepetition(rows[0]);
}

export async function getSpacedRepetition(
  ownerId: string,
  nodeId: string,
): Promise<SpacedRepetitionRow | null> {
  const rows = await getDb().query(
    `select node_id, owner_id, subject_id, stability, difficulty, reps, lapses, interval_days,
            last_reviewed_at, next_review_at, created_at, updated_at
     from lms_spaced_repetition
     where node_id = $1 and owner_id = $2`,
    [nodeId, ownerId],
  );
  return rows.length > 0 ? mapSpacedRepetition(rows[0]) : null;
}

export async function listDueReviews(
  ownerId: string,
  beforeTimestamp: string = new Date().toISOString(),
): Promise<SpacedRepetitionRow[]> {
  const rows = await getDb().query(
    `select node_id, owner_id, subject_id, stability, difficulty, reps, lapses, interval_days,
            last_reviewed_at, next_review_at, created_at, updated_at
     from lms_spaced_repetition
     where owner_id = $1 and next_review_at <= $2
     order by next_review_at asc`,
    [ownerId, new Date(beforeTimestamp)],
  );
  return rows.map(mapSpacedRepetition);
}

export async function countDueReviewsForSubject(
  ownerId: string,
  subjectId: string,
  beforeTimestamp: string = new Date().toISOString(),
): Promise<number> {
  const rows = await getDb().query(
    `select count(*)::int as due_count
     from lms_spaced_repetition
     where owner_id = $1 and subject_id = $2 and next_review_at <= $3`,
    [ownerId, subjectId, new Date(beforeTimestamp)],
  );
  return Number(rows[0]?.due_count ?? 0);
}

export async function getSubjectReviewStats(
  ownerId: string,
  subjectId: string,
  sinceDate?: Date,
): Promise<{ total: number; passed: number }> {
  const whereClauses = [
    "q.subject_id = $1",
    "sub.owner_id = $2",
    "q.quiz_purpose = 'spaced_repetition'",
    "q.completed_at is not null",
  ];
  const params: unknown[] = [subjectId, ownerId];
  if (sinceDate) {
    params.push(sinceDate);
    whereClauses.push(`q.completed_at >= $${params.length}`);
  }
  const rows = await getDb().query(
    `select count(*)::int as total,
            count(*) filter (where q.passed = true)::int as passed
     from lms_quizzes q
     join lms_subjects sub on q.subject_id = sub.id
     where ${whereClauses.join(" and ")}`,
    params,
  );
  if (rows.length === 0) return { total: 0, passed: 0 };
  return {
    total: Number(rows[0].total ?? 0),
    passed: Number(rows[0].passed ?? 0),
  };
}

export async function getSourceChunkCounts(
  ownerId: string,
  subjectId: string,
): Promise<Record<string, number>> {
  const rows = await getDb().query(
    `select c.source_id, count(*)::int as count
     from lms_rag_chunks c
     join lms_sources s on c.source_id = s.id
     join lms_subjects sub on s.subject_id = sub.id
     where sub.owner_id = $1 and s.subject_id = $2
     group by c.source_id`,
    [ownerId, subjectId],
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[String(r.source_id)] = Number(r.count);
  }
  return result;
}

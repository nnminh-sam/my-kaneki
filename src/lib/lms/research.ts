import { getDb, type Row } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getSubjectBySlug, getSubjectById, getSourceById } from "./repo";
import {
  sanitizeLmsPath,
  putKnowledgeFile,
  upsertSubjectSourceMetadata,
} from "./github-knowledge";
import { indexSource } from "./rag";
import {
  transitionSubmitDraft,
  transitionValidateDraft,
  transitionResolveEscalation,
  type SubmitDraftInput,
  type ValidateDraftInput,
  type ResolveEscalationInput,
} from "./research-machine";
import type {
  SourceRow,
  SourcePerspective,
  ResearchDebateTurn,
  SourceValidationStatus,
  SourceTrack,
  SourceType,
} from "./types";

function mapSourceRow(row: Row): SourceRow {
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

/**
 * Starts a new Track 2 agent research topic session.
 */
export async function startResearchSession(
  ownerId: string,
  subjectSlug: string,
  topic: string,
  perspectives: SourcePerspective[] = ["mixed"],
): Promise<SourceRow> {
  const subject = await getSubjectBySlug(ownerId, subjectSlug);
  if (!subject) {
    throw new Error(`Subject "${subjectSlug}" not found for owner.`);
  }

  const topicSlug = topic
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");

  const githubPath = sanitizeLmsPath(subjectSlug, "sources", `${topicSlug}.md`);

  const db = getDb();
  const id = `res_${Math.random().toString(36).slice(2, 10)}`;

  const rows = await db.query(
    `insert into lms_sources (
       id, subject_id, track, source_type, title, original_uri, github_md_path,
       perspective, validation_status, review_round, debate_history
     ) values ($1, $2, 'agent_research', 'web_synthesis', $3, $4, $5, $6, 'pending', 0, '[]'::jsonb)
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [id, subject.id, topic, topicSlug, githubPath, perspectives[0] || "mixed"],
  );

  const res = mapSourceRow(rows[0]);
  await recordAudit({
    action: "lms.research.start",
    entityType: "lms_source",
    entityId: res.id,
    actor: "ai-agent",
    payload: { subjectSlug, topic },
  });

  return res;
}

/**
 * Extracts latest draft markdown from the source's debate history.
 */
function extractLatestDraftMarkdown(debateHistory: ResearchDebateTurn[]): string {
  for (let i = debateHistory.length - 1; i >= 0; i--) {
    const turn = debateHistory[i];
    const draft = (turn as unknown as { draftMarkdown?: string }).draftMarkdown;
    if (turn.actor === "research_agent" && draft) {
      return draft;
    }
  }
  return "";
}

/**
 * Research agent submits a new research draft or revision with defense arguments.
 */
export async function submitResearchDraft(
  ownerId: string,
  sourceId: string,
  input: SubmitDraftInput,
): Promise<SourceRow> {
  const source = await getSourceById(ownerId, sourceId);
  if (!source) {
    throw new Error(`Research source "${sourceId}" not found for owner.`);
  }

  // 1. Run pure state transition
  const nextMachineState = transitionSubmitDraft(
    {
      validationStatus: source.validation_status,
      reviewRound: source.review_round,
      debateHistory: source.debate_history,
      currentDraftMarkdown: input.draftMarkdown,
    },
    input,
  );

  // Store draft markdown on the turn object so it persists in the debate transcript
  const turns = [...nextMachineState.debateHistory];
  const lastTurn = turns[turns.length - 1] as unknown as { draftMarkdown?: string };
  if (lastTurn) {
    lastTurn.draftMarkdown = input.draftMarkdown;
  }

  // 2. Persist to database
  const db = getDb();
  const rows = await db.query(
    `update lms_sources
     set validation_status = $2,
         debate_history = $3::jsonb,
         updated_at = now()
     where id = $1
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [sourceId, nextMachineState.validationStatus, JSON.stringify(turns)],
  );

  const updatedSource = mapSourceRow(rows[0]);
  await recordAudit({
    action: "lms.research.submit_draft",
    entityType: "lms_source",
    entityId: sourceId,
    actor: "ai-agent",
    payload: { round: source.review_round + 1, hasDefense: Boolean(input.defenseArgument) },
  });

  return updatedSource;
}

/**
 * Validation agent peer-reviews the draft, checks perspectives and citations,
 * and either marks as validated or returns specific defects (up to 3 rounds).
 */
export async function validateResearchDraft(
  ownerId: string,
  sourceId: string,
  input: ValidateDraftInput,
): Promise<SourceRow> {
  const source = await getSourceById(ownerId, sourceId);
  if (!source) {
    throw new Error(`Research source "${sourceId}" not found for owner.`);
  }

  // Extract latest draft markdown from the debate history
  const latestDraft = extractLatestDraftMarkdown(source.debate_history);

  // 1. Run pure state transition
  const nextMachineState = transitionValidateDraft(
    {
      validationStatus: source.validation_status,
      reviewRound: source.review_round,
      debateHistory: source.debate_history,
      currentDraftMarkdown: latestDraft,
    },
    input,
  );

  const db = getDb();

  // 2. Persist status and debate history
  const rows = await db.query(
    `update lms_sources
     set validation_status = $2,
         review_round = $3,
         debate_history = $4::jsonb,
         updated_at = now()
     where id = $1
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [
      sourceId,
      nextMachineState.validationStatus,
      nextMachineState.reviewRound,
      JSON.stringify(nextMachineState.debateHistory),
    ],
  );

  const updatedSource = mapSourceRow(rows[0]);

  // 3. If accepted and validated, commit to GitHub and index into RAG
  if (nextMachineState.validationStatus === "validated" && latestDraft) {
    const subject = await getSubjectById(ownerId, source.subject_id);
    if (subject) {
      await commitAndIndexValidatedResearch(subject.slug, updatedSource, latestDraft);
    }
  }

  await recordAudit({
    action: "lms.research.validate_draft",
    entityType: "lms_source",
    entityId: sourceId,
    actor: "ai-agent",
    payload: {
      decision: input.decision,
      round: nextMachineState.reviewRound,
      status: nextMachineState.validationStatus,
    },
  });

  return updatedSource;
}

/**
 * Human user resolves an escalated research debate (Approve Override, Edit & Approve, or Reject).
 */
export async function resolveResearchEscalation(
  ownerId: string,
  sourceId: string,
  input: ResolveEscalationInput,
): Promise<SourceRow> {
  const source = await getSourceById(ownerId, sourceId);
  if (!source) {
    throw new Error(`Research source "${sourceId}" not found for owner.`);
  }

  const latestDraft = extractLatestDraftMarkdown(source.debate_history);

  // 1. Run pure state transition
  const nextMachineState = transitionResolveEscalation(
    {
      validationStatus: source.validation_status,
      reviewRound: source.review_round,
      debateHistory: source.debate_history,
      currentDraftMarkdown: latestDraft,
    },
    input,
  );

  const db = getDb();
  const rows = await db.query(
    `update lms_sources
     set validation_status = $2,
         debate_history = $3::jsonb,
         updated_at = now()
     where id = $1
     returning id, subject_id, track, source_type, title, original_uri, github_md_path,
               perspective, validation_status, review_round, debate_history, file_sha, content_hash,
               created_at, updated_at`,
    [
      sourceId,
      nextMachineState.validationStatus,
      JSON.stringify(nextMachineState.debateHistory),
    ],
  );

  const updatedSource = mapSourceRow(rows[0]);
  const finalMarkdown = input.editedMarkdown || latestDraft;

  // 2. If approved, commit to GitHub and index RAG
  if (nextMachineState.validationStatus === "validated" && finalMarkdown) {
    const subject = await getSubjectById(ownerId, source.subject_id);
    if (subject) {
      await commitAndIndexValidatedResearch(subject.slug, updatedSource, finalMarkdown);
    }
  }

  await recordAudit({
    action: "lms.research.resolve_escalation",
    entityType: "lms_source",
    entityId: sourceId,
    actor: "user",
    payload: { userDecision: input.userDecision },
  });

  return updatedSource;
}

/**
 * Commits a validated research synthesis document to GitHub under lms/<slug>/sources/
 * and indexes its chunks into Neon PostgreSQL (pgvector).
 */
async function commitAndIndexValidatedResearch(
  subjectSlug: string,
  source: SourceRow,
  markdown: string,
): Promise<void> {
  const filename = source.github_md_path.split("/").pop() || `${source.id}.md`;
  const githubPath = sanitizeLmsPath(subjectSlug, "sources", filename);

  // 1. Commit to GitHub
  const putRes = await putKnowledgeFile(
    githubPath,
    markdown,
    `Commit validated research: ${source.title} for ${subjectSlug}`,
  );

  const sha = putRes.ok ? putRes.sha : source.file_sha || "local_sha";

  // 2. Update directory metadata.json on GitHub
  if (putRes.ok) {
    await upsertSubjectSourceMetadata(subjectSlug, {
      filename,
      path: githubPath,
      owner: "agent_research",
      sourceType: "web_synthesis",
      perspective: source.perspective,
      sha,
      updatedAt: new Date().toISOString(),
      sizeBytes: Buffer.byteLength(markdown, "utf-8"),
    });
  }

  // 3. Update database record with github_md_path and file_sha
  const db = getDb();
  await db.query(
    `update lms_sources
     set github_md_path = $2, file_sha = $3, updated_at = now()
     where id = $1`,
    [source.id, githubPath, sha],
  );

  // 4. Index chunks into RAG
  await indexSource(source.id, markdown);
}

/**
 * Lists all research topics currently escalated to the human user for a decision.
 */
export async function listEscalations(
  ownerId: string,
  subjectSlug?: string,
): Promise<SourceRow[]> {
  const db = getDb();
  let sql = `
    select s.id, s.subject_id, s.track, s.source_type, s.title, s.original_uri, s.github_md_path,
           s.perspective, s.validation_status, s.review_round, s.debate_history, s.file_sha, s.content_hash,
           s.created_at, s.updated_at
    from lms_sources s
    join lms_subjects sub on s.subject_id = sub.id
    where sub.owner_id = $1 and s.validation_status = 'escalated_to_user'
  `;
  const params: unknown[] = [ownerId];

  if (subjectSlug) {
    sql += ` and sub.slug = $2`;
    params.push(subjectSlug);
  }

  sql += ` order by s.updated_at desc`;

  const rows = await db.query(sql, params);
  return rows.map(mapSourceRow);
}

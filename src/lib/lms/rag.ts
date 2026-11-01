import crypto from "node:crypto";
import { getDb, type Db, type Row } from "@/lib/db";
import { getEmbedderForOwner } from "./embeddings";
import { chunkMarkdown } from "./chunker";
import { extractFileContent } from "./parsers";
import { getKnowledgeFile } from "./github-knowledge";
import type { SourceRow } from "./types";

export interface RagSearchParams {
  ownerId: string;
  subjectSlug: string;
  query: string;
  track?: "byos" | "agent_research";
  perspective?: "theory" | "practical" | "critique" | "reference" | "mixed";
  difficultyLevel?: number;
  limit?: number;
}

export interface RagSearchResult {
  chunkId: string;
  sourceId: string;
  nodeId: string | null;
  githubMdPath: string;
  heading: string;
  content: string;
  score: number;
  perspective: string;
  track: string;
  metadata: Record<string, unknown>;
}

let hasVectorColumnCache: boolean | undefined;

/**
 * Checks whether the lms_rag_chunks table has an 'embedding' column in the current DB.
 */
async function checkHasVectorColumn(db: Db): Promise<boolean> {
  if (hasVectorColumnCache !== undefined) {
    return hasVectorColumnCache;
  }
  try {
    const rows = await db.query(
      `select 1 from information_schema.columns
       where table_name = 'lms_rag_chunks' and column_name = 'embedding'`,
    );
    hasVectorColumnCache = rows.length > 0;
  } catch {
    hasVectorColumnCache = false;
  }
  return hasVectorColumnCache;
}

export function resetVectorColumnCacheForTests() {
  hasVectorColumnCache = undefined;
}

/**
 * Indexes a source document into lms_rag_chunks:
 * 1. Obtains extracted text (passed directly or fetched from GitHub).
 * 2. Checks contentHash for idempotency.
 * 3. Chunks the Markdown semantically.
 * 4. Computes vector embeddings.
 * 5. Replaces chunks atomically in a database transaction.
 */
export async function indexSource(
  sourceId: string,
  extractedText?: string,
  embeddingOverride?: { provider?: string; model?: string },
): Promise<{ chunkCount: number; contentHash: string }> {
  const db = getDb();

  const sourceRows = await db.query(
    `select id, subject_id, track, source_type, title, original_uri, github_md_path,
            perspective, validation_status, content_hash
     from lms_sources where id = $1`,
    [sourceId],
  );

  if (sourceRows.length === 0) {
    throw new Error(`Source "${sourceId}" not found for indexing`);
  }

  const source = sourceRows[0] as unknown as SourceRow;

  // 1. Resolve content
  let text = extractedText;
  if (!text) {
    if (!source.github_md_path) {
      throw new Error(`Source "${sourceId}" has neither extracted text nor a github_md_path.`);
    }
    const fileRes = await getKnowledgeFile(source.github_md_path);
    if (!fileRes.ok) {
      throw new Error(`Failed to load source file from GitHub: ${fileRes.error}`);
    }

    const parsed = await extractFileContent(fileRes.buffer, source.github_md_path);
    text = parsed.text;
  }

  const contentHash = crypto.createHash("sha256").update(text).digest("hex");

  // 2. Chunker
  const chunks = chunkMarkdown(text);
  if (chunks.length === 0) {
    // Empty source, clean up existing chunks
    await db.query(`delete from lms_rag_chunks where source_id = $1`, [sourceId]);
    await db.query(
      `update lms_sources set content_hash = $2, updated_at = now() where id = $1`,
      [sourceId, contentHash],
    );
    return { chunkCount: 0, contentHash };
  }

  // 3. Compute Embeddings
  const subjectRows = await db.query(
    `select owner_id from lms_subjects where id = $1`,
    [source.subject_id],
  );
  const ownerId = subjectRows.length > 0 ? String(subjectRows[0].owner_id) : "";
  const embedder = await getEmbedderForOwner(ownerId, embeddingOverride);
  const chunkContents = chunks.map((c) => c.content);
  const embeddings = await embedder.embed(chunkContents);

  // 4. Check for pgvector support
  const hasVector = await checkHasVectorColumn(db);

  // 5. Database transaction to replace chunks atomically
  const statements: Array<{ text: string; params: unknown[] }> = [
    {
      text: `delete from lms_rag_chunks where source_id = $1`,
      params: [sourceId],
    },
  ];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkId = `chk_${sourceId}_${i + 1}`;
    const embedding = embeddings[i] || [];
    const meta = {
      ...chunk.metadata,
      heading: chunk.heading,
      breadcrumb: chunk.breadcrumb,
    };

    if (hasVector) {
      statements.push({
        text: `insert into lms_rag_chunks (
                 id, subject_id, source_id, github_md_path, chunk_index, content, metadata, embedding
               ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::vector)`,
        params: [
          chunkId,
          source.subject_id,
          sourceId,
          source.github_md_path,
          i,
          chunk.content,
          JSON.stringify(meta),
          `[${embedding.join(",")}]`,
        ],
      });
    } else {
      statements.push({
        text: `insert into lms_rag_chunks (
                 id, subject_id, source_id, github_md_path, chunk_index, content, metadata
               ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        params: [
          chunkId,
          source.subject_id,
          sourceId,
          source.github_md_path,
          i,
          chunk.content,
          JSON.stringify(meta),
        ],
      });
    }
  }

  statements.push({
    text: `update lms_sources set content_hash = $2, updated_at = now() where id = $1`,
    params: [sourceId, contentHash],
  });

  await db.transaction(statements);

  return { chunkCount: chunks.length, contentHash };
}

/**
 * Searches the subject's RAG knowledge chunks using hybrid semantic + full-text search
 * merged with Reciprocal Rank Fusion (RRF). Always isolated by owner and subject.
 */
export async function searchRag(params: RagSearchParams): Promise<RagSearchResult[]> {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  // Guard: Verify subject belongs to owner
  const subjectRows = await db.query(
    `select id from lms_subjects where owner_id = $1 and slug = $2`,
    [params.ownerId, params.subjectSlug],
  );

  if (subjectRows.length === 0) {
    return [];
  }

  const subjectId = String(subjectRows[0].id);
  const hasVector = await checkHasVectorColumn(db);

  // Filters
  const whereClauses: string[] = ["c.subject_id = $1"];
  const queryParams: unknown[] = [subjectId];
  let paramIdx = 2;

  if (params.track) {
    whereClauses.push(`s.track = $${paramIdx}`);
    queryParams.push(params.track);
    paramIdx++;
  }

  if (params.perspective) {
    whereClauses.push(`s.perspective = $${paramIdx}`);
    queryParams.push(params.perspective);
    paramIdx++;
  }

  if (params.difficultyLevel !== undefined) {
    whereClauses.push(`(n.difficulty_level is null or n.difficulty_level <= $${paramIdx})`);
    queryParams.push(params.difficultyLevel);
    paramIdx++;
  }

  const whereSql = whereClauses.join(" and ");

  // Rank Map for Reciprocal Rank Fusion: chunkId -> { rankVector, rankText, row }
  const rrfScores = new Map<string, { score: number; row: Row }>();

  // 1. Text Search (ts_rank + ILIKE)
  const textQuery = params.query.trim();
  if (textQuery) {
    const textSql = `
      select c.id, c.source_id, c.node_id, c.github_md_path, c.chunk_index, c.content, c.metadata,
             s.track, s.perspective,
             ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $${paramIdx})) as rank_score
      from lms_rag_chunks c
      join lms_sources s on c.source_id = s.id
      left join lms_nodes n on c.node_id = n.id
      where ${whereSql} and (
        to_tsvector('english', c.content) @@ plainto_tsquery('english', $${paramIdx})
        or c.content ilike $${paramIdx + 1}
      )
      order by rank_score desc, c.chunk_index asc
      limit $${paramIdx + 2}
    `;

    const textRows = await db.query(textSql, [
      ...queryParams,
      textQuery,
      `%${textQuery}%`,
      limit * 2,
    ]);

    textRows.forEach((row, idx) => {
      const id = String(row.id);
      const rrf = 1 / (60 + (idx + 1));
      const existing = rrfScores.get(id);
      if (existing) {
        existing.score += rrf;
      } else {
        rrfScores.set(id, { score: rrf, row });
      }
    });
  }

  // 2. Vector Search (if pgvector column exists)
  if (hasVector) {
    const embedder = await getEmbedderForOwner(params.ownerId);
    const [queryVec] = await embedder.embed([params.query]);
    const vecStr = `[${queryVec.join(",")}]`;

    const vecSql = `
      select c.id, c.source_id, c.node_id, c.github_md_path, c.chunk_index, c.content, c.metadata,
             s.track, s.perspective,
             1 - (c.embedding <=> $${paramIdx}::vector) as sim
      from lms_rag_chunks c
      join lms_sources s on c.source_id = s.id
      left join lms_nodes n on c.node_id = n.id
      where ${whereSql}
      order by c.embedding <=> $${paramIdx}::vector asc
      limit $${paramIdx + 1}
    `;

    try {
      const vecRows = await db.query(vecSql, [...queryParams, vecStr, limit * 2]);
      vecRows.forEach((row, idx) => {
        const id = String(row.id);
        const rrf = 1 / (60 + (idx + 1));
        const existing = rrfScores.get(id);
        if (existing) {
          existing.score += rrf;
        } else {
          rrfScores.set(id, { score: rrf, row });
        }
      });
    } catch {
      // Vector search query failed (e.g. extension not loaded in test driver); fallback to text only
    }
  }

  // Sort by combined RRF score descending
  const sorted = Array.from(rrfScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return sorted.map(({ score, row }) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      chunkId: String(row.id),
      sourceId: String(row.source_id),
      nodeId: row.node_id ? String(row.node_id) : null,
      githubMdPath: String(row.github_md_path ?? ""),
      heading: String(meta.heading ?? "Section"),
      content: String(row.content),
      score: Number(score.toFixed(6)),
      perspective: String(row.perspective ?? "mixed"),
      track: String(row.track ?? "byos"),
      metadata: meta,
    };
  });
}

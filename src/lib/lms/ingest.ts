import { getDb } from "@/lib/db";
import { getSubjectBySlug, createSource, getSourceById } from "./repo";
import {
  sanitizeLmsPath,
  putKnowledgeFile,
  upsertSubjectSourceMetadata,
} from "./github-knowledge";
import { extractFileContent, detectFormatFromFilename } from "./parsers";
import { indexSource } from "./rag";
import type { SourcePerspective, SourceType } from "./types";

export interface IngestUserFileInput {
  ownerId: string;
  subjectSlug: string;
  filename: string;
  bytes: Buffer;
  skipRag?: boolean;
  perspective?: SourcePerspective;
  title?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
}

export interface IngestUserFileResult {
  success: boolean;
  sourceId?: string;
  filename: string;
  githubPath?: string;
  sha?: string;
  chunkCount: number;
  warnings: string[];
  error?: string;
}

/**
 * Ingests a user file (Track 1 BYOS):
 * 1. Commits original file bytes as-is to GitHub: lms/<slug>/sources/<filename>.
 * 2. Updates directory manifest: lms/<slug>/sources/metadata.json (owner: "user").
 * 3. Records/updates lms_sources row with track='byos' and validation_status='validated'.
 * 4. Extracts text in-memory and indexes chunks into lms_rag_chunks (if !skipRag).
 */
export async function ingestUserFile(
  input: IngestUserFileInput,
): Promise<IngestUserFileResult> {
  const warnings: string[] = [];

  // 1. Verify subject ownership
  const subject = await getSubjectBySlug(input.ownerId, input.subjectSlug);
  if (!subject) {
    return {
      success: false,
      filename: input.filename,
      chunkCount: 0,
      warnings,
      error: `Subject "${input.subjectSlug}" not found for owner.`,
    };
  }

  // 2. Sanitize path & detect format
  const cleanFilename = input.filename.trim().replace(/^.*[\\/]/, "");
  if (!cleanFilename) {
    return {
      success: false,
      filename: input.filename,
      chunkCount: 0,
      warnings,
      error: "Invalid filename.",
    };
  }

  const githubPath = sanitizeLmsPath(input.subjectSlug, "sources", cleanFilename);
  const detectedFormat = detectFormatFromFilename(cleanFilename);
  const sourceType: SourceType =
    detectedFormat === "unknown" || detectedFormat === "text" ? "markdown" : detectedFormat;

  // 3. Commit original file as-is to GitHub
  const putRes = await putKnowledgeFile(
    githubPath,
    input.bytes,
    `Ingest user file ${cleanFilename} for subject ${input.subjectSlug}`,
  );

  const fileSha = putRes.ok ? putRes.sha : "local_file_sha";
  if (!putRes.ok && putRes.code !== "CONFIG") {
    warnings.push(`GitHub storage warning: ${putRes.error}`);
  }

  // 4. Update lms/<slug>/sources/metadata.json on GitHub
  if (putRes.ok) {
    const metaRes = await upsertSubjectSourceMetadata(input.subjectSlug, {
      filename: cleanFilename,
      path: githubPath,
      owner: "user",
      sourceType,
      perspective: input.perspective ?? "reference",
      sha: fileSha,
      updatedAt: new Date().toISOString(),
      sizeBytes: input.bytes.length,
    });
    if (!metaRes.ok) {
      warnings.push(`Failed to update sources/metadata.json: ${metaRes.error}`);
    }
  }

  // 5. Upsert lms_sources relational record
  const db = getDb();
  const existingRows = await db.query(
    `select id from lms_sources
     where subject_id = $1 and (github_md_path = $2 or title = $3)`,
    [subject.id, githubPath, cleanFilename],
  );

  let sourceId: string;
  if (existingRows.length > 0) {
    sourceId = String(existingRows[0].id);
    await db.query(
      `update lms_sources
       set file_sha = $2,
           github_md_path = $3,
           track = 'byos',
           validation_status = 'validated',
           updated_at = now()
       where id = $1`,
      [sourceId, fileSha, githubPath],
    );
  } else {
    const created = await createSource(input.ownerId, subject.id, {
      track: "byos",
      sourceType,
      title: input.title || cleanFilename,
      originalUri: cleanFilename,
      githubMdPath: githubPath,
      perspective: input.perspective ?? "reference",
      validationStatus: "validated",
      fileSha,
    });
    sourceId = created.id;
  }

  // 6. On-demand text extraction and RAG indexing
  let chunkCount = 0;
  if (!input.skipRag) {
    const extracted = await extractFileContent(input.bytes, cleanFilename);
    warnings.push(...extracted.warnings);

    if (extracted.text.trim()) {
      const idxRes = await indexSource(sourceId, extracted.text, {
        provider: input.embeddingProvider,
        model: input.embeddingModel,
      });
      chunkCount = idxRes.chunkCount;
    } else {
      warnings.push(`No indexable text extracted from "${cleanFilename}".`);
    }
  }

  return {
    success: true,
    sourceId,
    filename: cleanFilename,
    githubPath,
    sha: fileSha,
    chunkCount,
    warnings,
  };
}

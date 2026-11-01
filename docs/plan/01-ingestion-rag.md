# Phase 1 — Ingestion (Track 1 BYOS) & RAG

Depends on: Phase 0.

## Storage Principles
- **Organized by Subject**: All sources for a subject (both user-uploaded files and agent-researched Markdown) live under `lms/<subject-slug>/sources/`.
- **Directory Metadata File**: `lms/<subject-slug>/sources/metadata.json` tracks the list of files in the directory and each file's owner (`"user"` vs `"agent_research"`), source type, perspective, validation status, and Git blob SHA.
- **Original User Files Preserved**: User-uploaded files (`.pdf`, `.docx`, `.xlsx`, `.csv`, `.md`, `.txt`) are committed **as-is in their original format** to `lms/<subject-slug>/sources/<original-filename>`.
- **On-Demand Normalization for RAG Only**: Normalization/text extraction is performed strictly in-memory when chunking & embedding into `lms_rag_chunks` (and skipped when not needed, e.g., for plain `.md`/`.txt` or non-RAG mode). No converted `.md` copy of a user file is written to the GitHub repository.

## T1.1 Parsers (In-Memory Text Extraction for RAG) — `src/lib/lms/parsers/`
Used only when extracting text/tables for RAG indexing; not needed when storing the original file or if the file is already plain text/Markdown.
Each extractor: `(buffer: Buffer, filename) → { text: string; warnings: string[] }`.
- `markdown.ts` / `text.ts` — direct passthrough (no normalization needed).
- `pdf.ts` — evaluate `unpdf` or `pdfjs-dist` (must run on Vercel serverless; avoid native bindings).
- `docx.ts` — `mammoth` → text/markdown extraction for chunking.
- `xlsx.ts` / `csv.ts` — `exceljs` or `xlsx`; tabular text per sheet, cap rows (e.g. 500) with a truncation note; escape `|`.
- `index.ts` — dispatch by extension + magic-number sniff; reject unsupported types and size over limit (UI says 50MB; Vercel function body limit is ~4.5MB, so large files need a **direct-to-blob/signed upload** or a lowered limit. Decide in T1.6).
- **Accept:** fixture-based tests with tiny generated files for each format; a malformed file returns a typed error, not a throw into the stream.

## T1.2 GitHub knowledge & metadata writer — extend `src/actions/github.ts`
- Generic `putKnowledgeFile(path, content: Buffer | string, message)` and `getKnowledgeFile(path)` under the `lms/<slug>/…` prefix, supporting both binary (`Buffer` base64-encoded for `.pdf`/`.docx`/`.xlsx`) and UTF-8 text files, reusing the existing SHA/conflict handling (`CONFLICT`, `RATE_LIMITED` codes).
- Metadata helper `upsertSubjectSourceMetadata(subjectSlug, entry)` that reads/updates `lms/<slug>/sources/metadata.json` with `{ filename, path, owner: "user" | "agent_research", sourceType, perspective, sha, updatedAt }`.
- Path builder with slug/filename sanitisation (no `..`, no leading `/`); unit test it.
- Ensure `lms/` is excluded from, or intentionally shown in, the Notes `FileTree` (check how notes lists the repo).

## T1.3 Embeddings — `src/lib/lms/embeddings.ts`
- `embed(texts: string[]): Promise<number[][]>` behind an interface; provider chosen via env (`LMS_EMBEDDING_MODEL`, base URL). Batch, retry with backoff, validate dimension = 1536 (or adjust the column; see README open question 1).
- Fake deterministic embedder for tests.

## T1.4 Indexer — `src/lib/lms/rag.ts`
- `indexSource(sourceId, extractedText?)`: takes the in-memory extracted text (or reads the file from GitHub and extracts in-memory if needed) → `chunker` → embed → replace chunks in one transaction (delete old chunks by `source_id`, insert new). Idempotent via `content_hash`.
- `searchRag({ownerId, subjectSlug, query, track?, perspective?, difficultyLevel?, limit})`: hybrid = cosine top-k ∪ `ts_rank` top-k merged with reciprocal-rank fusion. Always scoped by owner and subject.
- **Accept:** PGlite/Neon test with the fake embedder; filters verified; cross-owner leakage test.

## T1.5 Ingestion service — `src/lib/lms/ingest.ts`
`ingestUserFile({ownerId, subjectSlug, filename, bytes, skipRag?})`:
1. Commit the **original file bytes** directly to `lms/<slug>/sources/<filename>`.
2. Update `lms/<slug>/sources/metadata.json` with `owner: "user"`.
3. Insert/update `lms_sources` (`track='byos'`, `validation_status='validated'`, `github_md_path='lms/<slug>/sources/<filename>'`).
4. If RAG indexing is enabled (`!skipRag`), extract text in-memory (passthrough for `.md`/`.txt`, parser for `.pdf`/`.docx`/`.xlsx`) and call `indexSource`.
Handle failure at each step with a status of `failed` plus message so the UI can show/retry. Update on re-upload of the same filename (compare `file_sha`).

## T1.6 HTTP surface
- `POST /api/lms/sources` (multipart) → T1.5. Auth via the existing session helpers. Decide the large-file strategy (see T1.1).
- `GET /api/lms/sources?subject=` list; `DELETE` removes chunks, removes entry from `metadata.json`, and (optionally) deletes the GitHub file.

## Done when
Uploading a PDF/DOCX/XLSX/MD through the route stores the **original file** in `lms/<slug>/sources/<filename>`, updates `lms/<slug>/sources/metadata.json` (`owner: "user"`), records a `lms_sources` row, indexes chunks into `lms_rag_chunks` (when RAG is enabled), and `searchRag` returns them.

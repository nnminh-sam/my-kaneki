import { NextResponse, type NextRequest } from "next/server";
import { authMode, authenticate, bearerToken, SESSION_COOKIE } from "@/lib/auth";
import { getSubjectBySlug, listSources, getSourceById } from "@/lib/lms/repo";
import { ingestUserFile } from "@/lib/lms/ingest";
import { getDb } from "@/lib/db";
import { removeSubjectSourceMetadata } from "@/lib/lms/github-knowledge";
import { deleteFile } from "@/actions/github";
import type { SourcePerspective } from "@/lib/lms/types";

async function getOwner(req: Request): Promise<string | null> {
  const mode = authMode();
  if (mode === "open") return "";
  if (mode === "locked") return null;

  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.headers.get("cookie");
  const cookieMatch = cookieHeader?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const sessionCookie = cookieMatch ? cookieMatch[1] : undefined;

  const session = authenticate({ authorization: authHeader, sessionCookie });
  return session?.sub ?? null;
}

export async function GET(req: NextRequest) {
  const owner = await getOwner(req);
  if (owner === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const subjectSlug = searchParams.get("subject");
  if (!subjectSlug) {
    return NextResponse.json({ error: "Missing 'subject' query parameter." }, { status: 400 });
  }

  const subject = await getSubjectBySlug(owner, subjectSlug);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  }

  const sources = await listSources(owner, subject.id);
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const owner = await getOwner(req);
  if (owner === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const subjectSlug = formData.get("subject");
    const perspective = (formData.get("perspective") as SourcePerspective) || "reference";
    const skipRag = formData.get("skipRag") === "true";
    const embeddingProvider = formData.get("embeddingProvider");
    const embeddingModel = formData.get("embeddingModel");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing 'file' in multipart form data." }, { status: 400 });
    }
    if (!subjectSlug || typeof subjectSlug !== "string") {
      return NextResponse.json({ error: "Missing 'subject' slug in multipart form data." }, { status: 400 });
    }

    const filename = file.name || "uploaded-document";
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const result = await ingestUserFile({
      ownerId: owner,
      subjectSlug: subjectSlug.trim(),
      filename,
      bytes,
      perspective,
      skipRag,
      embeddingProvider: typeof embeddingProvider === "string" ? embeddingProvider : undefined,
      embeddingModel: typeof embeddingModel === "string" ? embeddingModel : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Ingestion failed" }, { status: 400 });
    }

    return NextResponse.json({ ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Upload error: ${message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const owner = await getOwner(req);
  if (owner === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let sourceId = searchParams.get("id");

  if (!sourceId) {
    try {
      const body = (await req.json()) as { id?: string };
      sourceId = body?.id ?? null;
    } catch {
      // not JSON
    }
  }

  if (!sourceId) {
    return NextResponse.json({ error: "Missing 'id' parameter." }, { status: 400 });
  }

  const source = await getSourceById(owner, sourceId);
  if (!source) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  const db = getDb();

  // 1. Delete RAG chunks & source row in relational DB
  await db.transaction([
    { text: `delete from lms_rag_chunks where source_id = $1`, params: [sourceId] },
    { text: `delete from lms_sources where id = $1`, params: [sourceId] },
  ]);

  // 2. Remove entry from GitHub metadata.json
  const subjectRows = await db.query(`select slug from lms_subjects where id = $1`, [source.subject_id]);
  if (subjectRows.length > 0) {
    const slug = String(subjectRows[0].slug);
    const filename = source.title || source.original_uri;
    await removeSubjectSourceMetadata(slug, filename);

    // 3. Delete original file on GitHub if present
    if (source.github_md_path) {
      await deleteFile(source.github_md_path, source.file_sha || undefined);
    }
  }

  return NextResponse.json({ success: true, id: sourceId });
}

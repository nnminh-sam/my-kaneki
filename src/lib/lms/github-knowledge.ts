import { recordAudit } from "@/lib/audit";
import type { ErrorCode, SaveResult } from "@/actions/github";

const API = "https://api.github.com";

function config() {
  const token = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch: process.env.GITHUB_BRANCH || undefined };
}

function contentsUrl(cfg: NonNullable<ReturnType<typeof config>>, path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encoded}`;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function mapError(res: Response, body: { message?: string } | null) {
  const msg = body?.message ?? res.statusText;
  const rateLimited =
    res.status === 429 ||
    (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
  if (rateLimited) {
    return { code: "RATE_LIMITED" as const, error: "GitHub rate limit hit. Try again shortly." };
  }
  switch (res.status) {
    case 401:
    case 403:
      return { code: "UNAUTHORIZED" as const, error: "GitHub rejected the token. Check GITHUB_PAT scopes (Contents: read/write)." };
    case 404:
      return { code: "NOT_FOUND" as const, error: "File or repository not found (or the token can't access it)." };
    case 409:
      return { code: "CONFLICT" as const, error: "File was changed on GitHub since last read. Reload and retry." };
    default:
      return { code: "UNKNOWN" as const, error: `GitHub error ${res.status}: ${msg}` };
  }
}

async function readJson(res: Response) {
  try {
    return (await res.json()) as Record<string, unknown> & { message?: string };
  } catch {
    return null;
  }
}

/**
 * Sanitizes an LMS repository path to guarantee it resides under lms/<slug>/
 * and contains no directory traversal (..) or leading/trailing slashes.
 */
export function sanitizeLmsPath(slug: string, ...parts: string[]): string {
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
  if (!cleanSlug) {
    throw new Error("Invalid subject slug");
  }

  const cleanParts = parts
    .map((p) => p.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/"))
    .filter((p) => p.length > 0);

  const rawPath = ["lms", cleanSlug, ...cleanParts].join("/");
  const segments = rawPath.split("/").filter((s) => s.length > 0 && s !== ".");

  for (const s of segments) {
    if (s === "..") {
      throw new Error(`Directory traversal detected in path: ${rawPath}`);
    }
  }

  return segments.join("/");
}

export type KnowledgeFileResult =
  | { ok: true; buffer: Buffer; text: string; sha: string }
  | { ok: false; code: ErrorCode; error: string };

const knowledgeCache = new Map<string, { result: KnowledgeFileResult; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60s cache

export function clearKnowledgeFileCache(repoPath?: string) {
  if (repoPath) {
    knowledgeCache.delete(repoPath);
  } else {
    knowledgeCache.clear();
  }
}

/**
 * Retrieves a file from the GitHub knowledge repository with 60s in-memory caching.
 */
export async function getKnowledgeFile(repoPath: string): Promise<KnowledgeFileResult> {
  const cached = knowledgeCache.get(repoPath);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO env vars." };

  try {
    const url = new URL(contentsUrl(cfg, repoPath));
    if (cfg.branch) url.searchParams.set("ref", cfg.branch);
    const res = await fetch(url, { headers: headers(cfg.token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok || !body) {
      return { ok: false, ...mapError(res, body) };
    }
    if (Array.isArray(body) || typeof body.content !== "string" || typeof body.sha !== "string") {
      return { ok: false, code: "INVALID_PATH", error: "Path is not a file." };
    }

    const buffer = Buffer.from(body.content, "base64");
    const result: KnowledgeFileResult = {
      ok: true,
      buffer,
      text: buffer.toString("utf-8"),
      sha: body.sha,
    };

    knowledgeCache.set(repoPath, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error contacting GitHub." };
  }
}

/**
 * Commits a binary buffer or UTF-8 text file directly to the GitHub knowledge repository.
 */
export async function putKnowledgeFile(
  repoPath: string,
  content: Buffer | string,
  message?: string,
  baseSha?: string | null,
): Promise<SaveResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO env vars." };

  try {
    // Check current remote sha if not provided
    let sha = baseSha;
    if (sha === undefined) {
      const current = await getKnowledgeFile(repoPath);
      if (current.ok) {
        sha = current.sha;
      } else if (current.code !== "NOT_FOUND") {
        return { ok: false, code: current.code, error: current.error };
      }
    }

    const base64Content = Buffer.isBuffer(content)
      ? content.toString("base64")
      : Buffer.from(content, "utf-8").toString("base64");

    const commitMessage = message ?? `${sha ? "Update" : "Create"} ${repoPath}`;

    const res = await fetch(contentsUrl(cfg, repoPath), {
      method: "PUT",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: commitMessage,
        content: base64Content,
        ...(sha ? { sha } : {}),
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });

    const body = await readJson(res);
    if (!res.ok) {
      return { ok: false, ...mapError(res, body) };
    }

    const newSha = (body?.content as { sha?: string } | undefined)?.sha ?? "";
    const commitSha = (body?.commit as { sha?: string } | undefined)?.sha;
    clearKnowledgeFileCache(repoPath);

    try {
      await recordAudit({
        action: sha ? "lms.github.update" : "lms.github.create",
        entityType: "github_file",
        entityId: repoPath,
        actor: "user",
        payload: {
          sha: newSha,
          commitSha,
          bytes: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, "utf-8"),
        },
      });
    } catch {
      // Ignore audit failure for GitHub writes
    }

    return {
      ok: true,
      sha: newSha,
      commitSha,
      commitUrl: commitSha
        ? `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/commit/${commitSha}`
        : undefined,
    };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error contacting GitHub." };
  }
}

// ============================================================================
// Directory Metadata Helper: lms/<slug>/sources/metadata.json
// ============================================================================

export interface SourceMetadataFileEntry {
  filename: string;
  path: string;
  owner: "user" | "agent_research";
  sourceType: string;
  perspective?: string;
  sha: string;
  updatedAt: string;
  sizeBytes?: number;
}

export interface SubjectSourceMetadata {
  subjectSlug: string;
  updatedAt: string;
  files: SourceMetadataFileEntry[];
}

/**
 * Reads lms/<slug>/sources/metadata.json from GitHub.
 */
export async function getSubjectSourceMetadata(
  subjectSlug: string,
): Promise<SubjectSourceMetadata | null> {
  const metadataPath = sanitizeLmsPath(subjectSlug, "sources", "metadata.json");
  const res = await getKnowledgeFile(metadataPath);
  if (!res.ok) return null;

  try {
    return JSON.parse(res.text) as SubjectSourceMetadata;
  } catch {
    return null;
  }
}

/**
 * Updates or appends a file entry in lms/<slug>/sources/metadata.json on GitHub.
 */
export async function upsertSubjectSourceMetadata(
  subjectSlug: string,
  entry: SourceMetadataFileEntry,
): Promise<SaveResult> {
  const metadataPath = sanitizeLmsPath(subjectSlug, "sources", "metadata.json");
  const existing = await getSubjectSourceMetadata(subjectSlug);

  const files = existing?.files ? [...existing.files] : [];
  const idx = files.findIndex((f) => f.filename === entry.filename);

  if (idx >= 0) {
    files[idx] = { ...files[idx], ...entry, updatedAt: new Date().toISOString() };
  } else {
    files.push({ ...entry, updatedAt: new Date().toISOString() });
  }

  const payload: SubjectSourceMetadata = {
    subjectSlug,
    updatedAt: new Date().toISOString(),
    files,
  };

  return putKnowledgeFile(
    metadataPath,
    JSON.stringify(payload, null, 2),
    `Update sources metadata for ${subjectSlug}: ${entry.filename}`,
  );
}

/**
 * Removes a file entry from lms/<slug>/sources/metadata.json.
 */
export async function removeSubjectSourceMetadata(
  subjectSlug: string,
  filename: string,
): Promise<SaveResult> {
  const metadataPath = sanitizeLmsPath(subjectSlug, "sources", "metadata.json");
  const existing = await getSubjectSourceMetadata(subjectSlug);
  if (!existing) {
    return { ok: true, sha: "" };
  }

  const files = existing.files.filter((f) => f.filename !== filename);
  const payload: SubjectSourceMetadata = {
    subjectSlug,
    updatedAt: new Date().toISOString(),
    files,
  };

  return putKnowledgeFile(
    metadataPath,
    JSON.stringify(payload, null, 2),
    `Remove source ${filename} from metadata in ${subjectSlug}`,
  );
}

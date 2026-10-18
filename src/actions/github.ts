"use server";

export type NoteResult =
  | { ok: true; content: string; sha: string | null }
  | { ok: false; code: ErrorCode; error: string };

export type SaveResult =
  | { ok: true; sha: string }
  | { ok: false; code: ErrorCode; error: string };

export type ErrorCode =
  | "CONFIG"
  | "INVALID_PATH"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNKNOWN";

const API = "https://api.github.com";

function config() {
  const token = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch: process.env.GITHUB_BRANCH || undefined };
}

function validatePath(repoPath: string): string | null {
  const p = repoPath.replace(/^\/+/, "");
  if (!p || p.includes("..") || p.includes("\\") || !/\.(md|markdown)$/i.test(p)) {
    return null;
  }
  return p;
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
      return { code: "CONFLICT" as const, error: "This note was changed on GitHub since you loaded it. Reload to get the latest version." };
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

async function fetchFile(
  cfg: NonNullable<ReturnType<typeof config>>,
  path: string,
): Promise<
  | { ok: true; content: string; sha: string }
  | { ok: false; status: number; code: ErrorCode; error: string }
> {
  const url = new URL(contentsUrl(cfg, path));
  if (cfg.branch) url.searchParams.set("ref", cfg.branch);
  const res = await fetch(url, { headers: headers(cfg.token), cache: "no-store" });
  const body = await readJson(res);
  if (!res.ok || !body) {
    return { ok: false, status: res.status, ...mapError(res, body) };
  }
  if (Array.isArray(body) || typeof body.content !== "string" || typeof body.sha !== "string") {
    return { ok: false, status: 422, code: "INVALID_PATH", error: "Path is not a file." };
  }
  return {
    ok: true,
    sha: body.sha,
    content: Buffer.from(body.content, "base64").toString("utf-8"),
  };
}

/**
 * Fetch a Markdown file and decode its base64 content.
 * A missing file resolves to empty content with sha=null so a first save creates it.
 */
export async function getNote(repoPath: string): Promise<NoteResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO env vars." };
  const path = validatePath(repoPath);
  if (!path) return { ok: false, code: "INVALID_PATH", error: "Path must be a relative .md file." };

  try {
    const file = await fetchFile(cfg, path);
    if (file.ok) return { ok: true, content: file.content, sha: file.sha };
    if (file.code === "NOT_FOUND") return { ok: true, content: "", sha: null };
    return { ok: false, code: file.code, error: file.error };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error contacting GitHub." };
  }
}

/**
 * Save a note. Looks up the current sha, base64-encodes content, PUTs the update.
 *
 * Pass `baseSha` (the sha returned by getNote) to detect edits made elsewhere:
 * if the remote sha differs, we return a CONFLICT instead of overwriting.
 */
export async function saveNote(
  repoPath: string,
  content: string,
  baseSha?: string | null,
): Promise<SaveResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO env vars." };
  const path = validatePath(repoPath);
  if (!path) return { ok: false, code: "INVALID_PATH", error: "Path must be a relative .md file." };

  try {
    const current = await fetchFile(cfg, path);
    let sha: string | undefined;
    if (current.ok) {
      if (baseSha !== undefined && baseSha !== null && baseSha !== current.sha) {
        return mapConflict();
      }
      sha = current.sha;
    } else if (current.code !== "NOT_FOUND") {
      return { ok: false, code: current.code, error: current.error };
    } else if (baseSha) {
      // We had loaded a file, but it's gone now.
      return { ok: false, code: "CONFLICT", error: "This note was deleted or moved on GitHub. Reload before saving." };
    }

    const res = await fetch(contentsUrl(cfg, path), {
      method: "PUT",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: `${sha ? "Update" : "Create"} ${path}`,
        content: Buffer.from(content, "utf-8").toString("base64"),
        ...(sha ? { sha } : {}),
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      // 409 = sha mismatch; 422 = sha missing/invalid because file changed under us.
      if (res.status === 422 && /sha/i.test(body?.message ?? "")) return mapConflict();
      return { ok: false, ...mapError(res, body) };
    }
    const newSha = (body?.content as { sha?: string } | undefined)?.sha;
    return { ok: true, sha: newSha ?? "" };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error contacting GitHub." };
  }
}

function mapConflict(): SaveResult {
  return {
    ok: false,
    code: "CONFLICT",
    error: "This note was changed on GitHub since you loaded it. Reload to get the latest version.",
  };
}

export type BranchCheckResult =
  | { ok: true; branch: string; exists: boolean; defaultBranch: string }
  | { ok: false; code: ErrorCode; error: string };

export async function checkBranch(branchName?: string): Promise<BranchCheckResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };

  const targetBranch = branchName || cfg.branch;

  try {
    const repoRes = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, {
      headers: headers(cfg.token),
      cache: "no-store",
    });
    const repoData = await readJson(repoRes);
    if (!repoRes.ok || !repoData) {
      return { ok: false, ...mapError(repoRes, repoData) };
    }

    const defaultBranch = (repoData.default_branch as string) || "main";
    const branchToCheck = targetBranch || defaultBranch;

    const branchRes = await fetch(
      `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/branches/${encodeURIComponent(branchToCheck)}`,
      { headers: headers(cfg.token), cache: "no-store" }
    );

    if (branchRes.status === 404) {
      return { ok: true, branch: branchToCheck, exists: false, defaultBranch };
    }

    if (!branchRes.ok) {
      const errBody = await readJson(branchRes);
      return { ok: false, ...mapError(branchRes, errBody) };
    }

    return { ok: true, branch: branchToCheck, exists: true, defaultBranch };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error checking branch." };
  }
}

export type SyncStatusResult =
  | { ok: true; remoteSha: string | null; inSync: boolean }
  | { ok: false; code: ErrorCode; error: string };

export async function checkSyncStatus(repoPath: string, localSha: string | null): Promise<SyncStatusResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };
  const path = validatePath(repoPath);
  if (!path) return { ok: false, code: "INVALID_PATH", error: "Path must be a relative .md file." };

  try {
    const file = await fetchFile(cfg, path);
    if (!file.ok) {
      if (file.code === "NOT_FOUND") {
        return { ok: true, remoteSha: null, inSync: localSha === null };
      }
      return { ok: false, code: file.code, error: file.error };
    }

    return {
      ok: true,
      remoteSha: file.sha,
      inSync: file.sha === localSha,
    };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error checking sync." };
  }
}

export interface TreeFileItem {
  path: string;
  sha: string;
  size?: number;
}

export type RepoTreeResult =
  | { ok: true; branch: string; files: TreeFileItem[] }
  | { ok: false; code: ErrorCode; error: string };

/**
 * Fetch files from the HEAD commit of the target branch using GitHub Git Trees API.
 * Endpoint: GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
 */
export async function getRepoTree(): Promise<RepoTreeResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };

  try {
    // Determine target branch
    let targetBranch = cfg.branch;
    if (!targetBranch) {
      const repoRes = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, {
        headers: headers(cfg.token),
        cache: "no-store",
      });
      const repoData = await readJson(repoRes);
      if (!repoRes.ok || !repoData) {
        return { ok: false, ...mapError(repoRes, repoData) };
      }
      targetBranch = (repoData.default_branch as string) || "main";
    }

    // Call Git Trees API with recursive=1 targeting HEAD of branch
    const treeRes = await fetch(
      `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`,
      { headers: headers(cfg.token), cache: "no-store" }
    );
    const treeData = await readJson(treeRes);
    if (!treeRes.ok || !treeData) {
      return { ok: false, ...mapError(treeRes, treeData) };
    }

    const tree = (treeData.tree as Array<{ path: string; type: string; sha: string; size?: number }>) || [];
    // Filter for files only (type === "blob")
    const files: TreeFileItem[] = tree
      .filter((item) => item.type === "blob")
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size,
      }));

    return {
      ok: true,
      branch: targetBranch,
      files,
    };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error fetching file tree." };
  }
}



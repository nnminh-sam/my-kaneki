"use server";

export type NoteResult =
  | { ok: true; content: string; sha: string | null }
  | { ok: false; code: ErrorCode; error: string };

export type SaveResult =
  | { ok: true; sha: string; commitSha?: string; commitUrl?: string }
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
  if (!p || p.includes("..") || p.includes("\\")) {
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
    const cSha = (body?.commit as { sha?: string } | undefined)?.sha;
    return {
      ok: true,
      sha: newSha ?? "",
      commitSha: cSha,
      commitUrl: commitUrl(cfg, cSha),
    };
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

export type OperationResult =
  | { ok: true; commitSha?: string; commitUrl?: string }
  | { ok: false; code: ErrorCode; error: string };

function commitUrl(cfg: NonNullable<ReturnType<typeof config>>, sha?: string): string | undefined {
  if (!sha) return undefined;
  return `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/commit/${sha}`;
}

/**
 * Delete a file from GitHub repo.
 * DELETE /repos/{owner}/{repo}/contents/{path}
 */
export async function deleteFile(repoPath: string, fileSha?: string): Promise<OperationResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };
  const path = validatePath(repoPath);
  if (!path) return { ok: false, code: "INVALID_PATH", error: "Invalid path." };

  try {
    let sha = fileSha;
    if (!sha) {
      const current = await fetchFile(cfg, path);
      if (!current.ok) return { ok: false, code: current.code, error: current.error };
      sha = current.sha;
    }

    const res = await fetch(contentsUrl(cfg, path), {
      method: "DELETE",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: `Delete ${path}`,
        sha,
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });

    const body = await readJson(res);
    if (!res.ok) {
      return { ok: false, ...mapError(res, body) };
    }
    const cSha = (body?.commit as { sha?: string } | undefined)?.sha;
    return { ok: true, commitSha: cSha, commitUrl: commitUrl(cfg, cSha) };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error deleting file." };
  }
}

/**
 * Rename or Move a file: creates target path with same content, then deletes original.
 * Optional content override allows saving current unsaved editor changes atomically with the rename.
 */
export async function renameFile(
  oldPath: string,
  newPath: string,
  contentOverride?: string
): Promise<OperationResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };

  const validOld = validatePath(oldPath);
  const validNew = validatePath(newPath);
  if (!validOld || !validNew) {
    return { ok: false, code: "INVALID_PATH", error: "Invalid file paths." };
  }
  if (validOld === validNew) {
    return { ok: false, code: "INVALID_PATH", error: "New path is identical to current path." };
  }

  try {
    // 1. Fetch source content if not provided
    const source = await fetchFile(cfg, validOld);
    if (!source.ok) return { ok: false, code: source.code, error: source.error };

    // 2. Check destination does not already exist
    const destination = await fetchFile(cfg, validNew);
    if (destination.ok) {
      return { ok: false, code: "CONFLICT", error: `Destination file "${validNew}" already exists on GitHub.` };
    }

    const finalContent = contentOverride !== undefined ? contentOverride : source.content;

    // 3. Create file at new path
    const createRes = await fetch(contentsUrl(cfg, validNew), {
      method: "PUT",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: `Move ${validOld} to ${validNew}`,
        content: Buffer.from(finalContent, "utf-8").toString("base64"),
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });
    const createBody = await readJson(createRes);
    if (!createRes.ok) {
      return { ok: false, ...mapError(createRes, createBody) };
    }

    // 4. Delete file at old path
    const deleteRes = await fetch(contentsUrl(cfg, validOld), {
      method: "DELETE",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: `Delete ${validOld} (moved to ${validNew})`,
        sha: source.sha,
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });
    const deleteBody = await readJson(deleteRes);
    if (!deleteRes.ok) {
      return {
        ok: false,
        code: "UNKNOWN",
        error: `Created new file at "${validNew}", but failed to delete original: ${deleteBody?.message || deleteRes.statusText}`,
      };
    }

    const cSha = (createBody?.commit as { sha?: string } | undefined)?.sha;
    return { ok: true, commitSha: cSha, commitUrl: commitUrl(cfg, cSha) };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error renaming file." };
  }
}

/**
 * Copy a file to a new destination path.
 */
export async function copyFile(sourcePath: string, destinationPath: string): Promise<OperationResult> {
  const cfg = config();
  if (!cfg) return { ok: false, code: "CONFIG", error: "Missing GitHub env variables." };

  const validSource = validatePath(sourcePath);
  const validDest = validatePath(destinationPath);
  if (!validSource || !validDest) {
    return { ok: false, code: "INVALID_PATH", error: "Invalid file paths." };
  }

  try {
    const source = await fetchFile(cfg, validSource);
    if (!source.ok) return { ok: false, code: source.code, error: source.error };

    const destination = await fetchFile(cfg, validDest);
    if (destination.ok) {
      return { ok: false, code: "CONFLICT", error: `Destination file "${validDest}" already exists.` };
    }

    const createRes = await fetch(contentsUrl(cfg, validDest), {
      method: "PUT",
      headers: headers(cfg.token),
      body: JSON.stringify({
        message: `Copy ${validSource} to ${validDest}`,
        content: Buffer.from(source.content, "utf-8").toString("base64"),
        ...(cfg.branch ? { branch: cfg.branch } : {}),
      }),
    });
    const createBody = await readJson(createRes);
    if (!createRes.ok) {
      return { ok: false, ...mapError(createRes, createBody) };
    }

    const cSha = (createBody?.commit as { sha?: string } | undefined)?.sha;
    return { ok: true, commitSha: cSha, commitUrl: commitUrl(cfg, cSha) };
  } catch {
    return { ok: false, code: "UNKNOWN", error: "Network error copying file." };
  }
}





import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = "https://api.github.com";

function config() {
  const token = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch: process.env.GITHUB_BRANCH || undefined };
}

export async function GET(request: NextRequest) {
  const cfg = config();
  if (!cfg) {
    return NextResponse.json(
      { error: "Missing GitHub env variables" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get("path");
  const clientSha = searchParams.get("sha");

  if (!pathParam) {
    return NextResponse.json(
      { error: "Query parameter 'path' is required" },
      { status: 400 }
    );
  }

  const cleanPath = pathParam.replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..") || cleanPath.includes("\\")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  const url = new URL(
    `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodedPath}`
  );
  if (cfg.branch) {
    url.searchParams.set("ref", cfg.branch);
  }

  // Format client sha as ETag header for conditional HTTP request
  const requestHeaders: HeadersInit = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (clientSha) {
    // GitHub ETags are enclosed in double quotes: e.g. W/"<sha>" or "<sha>"
    const formattedEtag = clientSha.startsWith('"') ? clientSha : `"${clientSha}"`;
    requestHeaders["If-None-Match"] = formattedEtag;
  }

  try {
    const res = await fetch(url.toString(), {
      headers: requestHeaders,
      cache: "no-store",
    });

    // 304 Not Modified: GitHub contents match client's sha (does not count against GitHub rate limit)
    if (res.status === 304) {
      return NextResponse.json(
        { isOutOfSync: false },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    if (res.status === 404) {
      // Remote file does not exist
      return NextResponse.json(
        { isOutOfSync: clientSha !== null && clientSha !== "", latestSha: null },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || `GitHub error: ${res.status}` },
        { status: res.status }
      );
    }

    // 200 OK: File was modified or sha differed
    const data = (await res.json()) as { sha?: string };
    const latestSha = data.sha ?? null;
    const isOutOfSync = clientSha ? latestSha !== clientSha : true;

    return NextResponse.json(
      { isOutOfSync, latestSha },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to GitHub" },
      { status: 502 }
    );
  }
}

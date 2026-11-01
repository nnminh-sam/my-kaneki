import { getDb } from "@/lib/db";
import { maskSecret } from "@/lib/ai/providers";
import { EXTERNAL_APPS } from "@/lib/navigation";

export type VercelDeploymentState =
  | "READY"
  | "BUILDING"
  | "ERROR"
  | "QUEUED"
  | "CANCELED"
  | "INITIALIZING";

export type VercelDeploymentTarget = "production" | "preview";

export interface UserVercelConfig {
  ownerId: string;
  apiToken: string;
  teamId: string;
  source: "db" | "env" | "none";
  updatedAt?: string;
}

export interface ClientVercelConfigView {
  configured: boolean;
  maskedToken: string;
  teamId: string;
  source: "db" | "env" | "none";
  updatedAt?: string;
}

export interface VercelDeploymentItem {
  id: string;
  name: string;
  projectId: string;
  url: string;
  inspectorUrl: string;
  state: VercelDeploymentState;
  target: VercelDeploymentTarget;
  createdAt: number;
  buildingAt: number | null;
  readyAt: number | null;
  durationMs: number | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  repoSlug: string | null;
  commitUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  creator: string | null;
}

export interface VercelProjectSummary {
  id: string;
  name: string;
  framework: string | null;
  productionUrl: string | null;
  repoSlug: string | null;
  updatedAt: number | null;
  workspaceAppId: string | null;
  latestDeployment: VercelDeploymentItem | null;
  latestProductionDeployment: VercelDeploymentItem | null;
}

export interface VercelBuildLogEvent {
  id: string;
  timestamp: number;
  text: string;
  type: string;
  level: "info" | "warn" | "error";
}

export interface VercelDashboardData {
  config: ClientVercelConfigView;
  deployments: VercelDeploymentItem[];
  projects: VercelProjectSummary[];
  externalAppStatuses: Record<
    string,
    {
      projectName: string;
      state: VercelDeploymentState;
      url: string;
      updatedAt: number;
      branch: string | null;
      commitSha: string | null;
    }
  >;
  counts: {
    total: number;
    ready: number;
    building: number;
    error: number;
    queued: number;
    canceled: number;
  };
  fetchedAt: string;
}

const VALID_STATES = new Set<VercelDeploymentState>([
  "READY",
  "BUILDING",
  "ERROR",
  "QUEUED",
  "CANCELED",
  "INITIALIZING",
]);

let vercelTableEnsured = false;

async function ensureUserVercelConfigsTable() {
  if (vercelTableEnsured) return;
  const db = getDb();
  await db.query(
    `create table if not exists user_vercel_configs (
       owner_id text primary key default '',
       api_token text not null default '',
       team_id text not null default '',
       updated_at timestamptz not null default now()
     )`,
  );
  vercelTableEnsured = true;
}

export function resetVercelTableEnsuredForTests() {
  vercelTableEnsured = false;
}

export function getEnvFallbackVercelConfig(
  ownerId = "",
  env: Record<string, string | undefined> = process.env,
): UserVercelConfig {
  const apiToken = (
    env.VERCEL_ACCESS_TOKEN ||
    env.VERCEL_API_TOKEN ||
    env.VERCEL_TOKEN ||
    ""
  ).trim();
  const teamId = (env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || "").trim();

  return {
    ownerId,
    apiToken,
    teamId,
    source: apiToken ? "env" : "none",
  };
}

export async function getUserVercelConfig(
  ownerId = "",
  env: Record<string, string | undefined> = process.env,
): Promise<UserVercelConfig> {
  const fallback = getEnvFallbackVercelConfig(ownerId, env);

  try {
    const db = getDb();
    const rows = await db.query(
      `select owner_id, api_token, team_id, updated_at
       from user_vercel_configs
       where owner_id = $1`,
      [ownerId],
    );

    let row = rows[0];
    if (!row && ownerId !== "") {
      const defaultRows = await db.query(
        `select owner_id, api_token, team_id, updated_at
         from user_vercel_configs
         where owner_id = ''`,
      );
      row = defaultRows[0];
    }

    if (!row) {
      return fallback;
    }

    const dbToken = String(row.api_token || "").trim();
    const dbTeam = String(row.team_id || "").trim();
    const effectiveToken = dbToken || fallback.apiToken;
    const effectiveTeam = dbTeam || fallback.teamId;

    return {
      ownerId,
      apiToken: effectiveToken,
      teamId: effectiveTeam,
      source: dbToken ? "db" : fallback.apiToken ? "env" : "none",
      updatedAt: row.updated_at
        ? new Date(String(row.updated_at)).toISOString()
        : undefined,
    };
  } catch {
    return fallback;
  }
}

export function toClientVercelConfigView(
  config: UserVercelConfig,
): ClientVercelConfigView {
  return {
    configured: Boolean(config.apiToken),
    maskedToken: maskSecret(config.apiToken),
    teamId: config.teamId,
    source: config.source,
    updatedAt: config.updatedAt,
  };
}

export async function saveUserVercelConfig(
  ownerId: string,
  input: {
    apiToken?: string;
    teamId?: string;
    clearToken?: boolean;
  },
): Promise<UserVercelConfig> {
  await ensureUserVercelConfigsTable();
  const db = getDb();
  const existing = await db.query(
    `select api_token, team_id from user_vercel_configs where owner_id = $1`,
    [ownerId],
  );

  const prevToken =
    existing.length > 0 ? String(existing[0].api_token || "").trim() : "";
  const prevTeam =
    existing.length > 0 ? String(existing[0].team_id || "").trim() : "";

  const nextToken = input.clearToken
    ? ""
    : input.apiToken !== undefined && input.apiToken.trim() !== ""
      ? input.apiToken.trim()
      : prevToken;

  const nextTeam =
    input.teamId !== undefined ? input.teamId.trim() : prevTeam;

  await db.query(
    `insert into user_vercel_configs (owner_id, api_token, team_id, updated_at)
     values ($1, $2, $3, now())
     on conflict (owner_id) do update set
       api_token = excluded.api_token,
       team_id = excluded.team_id,
       updated_at = now()`,
    [ownerId, nextToken, nextTeam],
  );

  return getUserVercelConfig(ownerId);
}

export function normalizeDeploymentState(raw: unknown): VercelDeploymentState {
  const upper = String(raw || "QUEUED").toUpperCase() as VercelDeploymentState;
  if (VALID_STATES.has(upper)) {
    return upper;
  }
  return "QUEUED";
}

export function normalizeDeploymentRecord(
  raw: Record<string, unknown>,
): VercelDeploymentItem {
  const id = String(raw.uid || raw.id || "");
  const name = String(raw.name || "unknown-project");
  const projectId = String(raw.projectId || name);
  const rawUrl = String(raw.url || "");
  const url = rawUrl
    ? rawUrl.startsWith("http")
      ? rawUrl
      : `https://${rawUrl}`
    : "";
  const inspectorUrl = String(raw.inspectorUrl || "");
  const state = normalizeDeploymentState(raw.readyState || raw.state);
  const target: VercelDeploymentTarget =
    raw.target === "production" ? "production" : "preview";

  const createdAt = Number(raw.createdAt || raw.created || Date.now());
  const buildingAt =
    typeof raw.buildingAt === "number" && raw.buildingAt > 0
      ? raw.buildingAt
      : null;
  const readyAt =
    typeof raw.ready === "number" && raw.ready > 0 ? raw.ready : null;

  let durationMs: number | null = null;
  const startTs = buildingAt ?? createdAt;
  if (readyAt && readyAt >= startTs) {
    durationMs = readyAt - startTs;
  }

  const meta =
    typeof raw.meta === "object" && raw.meta !== null
      ? (raw.meta as Record<string, unknown>)
      : {};

  const branch =
    String(
      meta.githubCommitRef ||
        meta.gitlabCommitRef ||
        meta.bitbucketCommitRef ||
        meta.branch ||
        "",
    ).trim() || null;

  const commitSha =
    String(
      meta.githubCommitSha ||
        meta.gitlabCommitSha ||
        meta.bitbucketCommitSha ||
        meta.commitSha ||
        "",
    ).trim() || null;

  const commitMessage =
    String(
      meta.githubCommitMessage ||
        meta.gitlabCommitMessage ||
        meta.bitbucketCommitMessage ||
        meta.commitMessage ||
        "",
    ).trim() || null;

  const commitAuthor =
    String(
      meta.githubCommitAuthorName ||
        meta.githubCommitAuthorLogin ||
        meta.gitlabCommitAuthorName ||
        meta.commitAuthor ||
        "",
    ).trim() || null;

  const githubOrg = String(meta.githubCommitOrg || meta.githubOrg || "").trim();
  const githubRepo = String(
    meta.githubCommitRepo || meta.githubRepo || "",
  ).trim();
  const repoSlug =
    githubOrg && githubRepo ? `${githubOrg}/${githubRepo}` : null;

  const commitUrl =
    repoSlug && commitSha
      ? `https://github.com/${repoSlug}/commit/${commitSha}`
      : null;

  const errorCode = raw.errorCode ? String(raw.errorCode) : null;
  const errorMessage = raw.errorMessage ? String(raw.errorMessage) : null;

  const creatorObj =
    typeof raw.creator === "object" && raw.creator !== null
      ? (raw.creator as Record<string, unknown>)
      : null;
  const creator = creatorObj
    ? String(
        creatorObj.username || creatorObj.githubLogin || creatorObj.email || "",
      ).trim() || null
    : null;

  return {
    id,
    name,
    projectId,
    url,
    inspectorUrl,
    state,
    target,
    createdAt,
    buildingAt,
    readyAt,
    durationMs,
    branch,
    commitSha,
    commitMessage,
    commitAuthor,
    repoSlug,
    commitUrl,
    errorCode,
    errorMessage,
    creator,
  };
}

/**
 * Matches a Vercel project name or alias domain against the workspace's known apps
 * (`my_kaneki`, `my_finance`, `my_pm_agent`).
 */
export function matchWorkspaceAppId(
  projectName: string,
  aliases: string[] = [],
): string | null {
  const normName = projectName.toLowerCase().replace(/[-_]/g, "");
  if (normName.includes("kaneki")) return "my_kaneki";
  if (normName.includes("myfinance") || normName === "finance") {
    return "my_finance";
  }
  if (normName.includes("mypmagent") || normName.includes("pmagent")) {
    return "my_pm_agent";
  }

  for (const app of EXTERNAL_APPS) {
    try {
      const host = new URL(app.href).hostname.toLowerCase();
      if (
        aliases.some((a) => a.toLowerCase().includes(host)) ||
        host.startsWith(projectName.toLowerCase())
      ) {
        return app.id;
      }
    } catch {}
  }

  return null;
}

function buildVercelUrl(
  path: string,
  teamId: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function fetchVercelDashboard(
  ownerId = "",
  options?: {
    projectId?: string;
    state?: string;
    target?: string;
    limit?: number;
    fetchImpl?: typeof fetch;
    configOverride?: UserVercelConfig;
  },
): Promise<VercelDashboardData> {
  const config =
    options?.configOverride ?? (await getUserVercelConfig(ownerId));
  const clientConfig = toClientVercelConfigView(config);

  if (!config.apiToken) {
    return {
      config: clientConfig,
      deployments: [],
      projects: [],
      externalAppStatuses: {},
      counts: {
        total: 0,
        ready: 0,
        building: 0,
        error: 0,
        queued: 0,
        canceled: 0,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    Accept: "application/json",
  };

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const deploymentsUrl = buildVercelUrl("/v6/deployments", config.teamId, {
    limit,
    projectId: options?.projectId,
    state: options?.state,
    target: options?.target,
  });
  const projectsUrl = buildVercelUrl("/v9/projects", config.teamId, {
    limit: 50,
  });

  const [depRes, projRes] = await Promise.all([
    fetchFn(deploymentsUrl, { headers, cache: "no-store" }),
    fetchFn(projectsUrl, { headers, cache: "no-store" }).catch(() => null),
  ]);

  if (!depRes.ok) {
    let errText = `Vercel API returned HTTP ${depRes.status}`;
    try {
      const errJson = (await depRes.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) {
        errText = errJson.error.message;
      }
    } catch {}
    throw new Error(errText);
  }

  const depJson = (await depRes.json()) as {
    deployments?: Record<string, unknown>[];
  };
  const rawDeployments = Array.isArray(depJson.deployments)
    ? depJson.deployments
    : [];
  const deployments = rawDeployments
    .map(normalizeDeploymentRecord)
    .sort((a, b) => b.createdAt - a.createdAt);

  const rawProjects: Record<string, unknown>[] = [];
  if (projRes && projRes.ok) {
    try {
      const projJson = (await projRes.json()) as {
        projects?: Record<string, unknown>[];
      };
      if (Array.isArray(projJson.projects)) {
        rawProjects.push(...projJson.projects);
      }
    } catch {}
  }

  const projectMap = new Map<string, VercelProjectSummary>();

  for (const p of rawProjects) {
    const id = String(p.id || p.name || "");
    const name = String(p.name || id);
    if (!id) continue;

    const framework = p.framework ? String(p.framework) : null;
    const link =
      typeof p.link === "object" && p.link !== null
        ? (p.link as Record<string, unknown>)
        : null;
    const repoSlug =
      link && link.org && link.repo ? `${link.org}/${link.repo}` : null;

    const targets =
      typeof p.targets === "object" && p.targets !== null
        ? (p.targets as Record<string, unknown>)
        : null;
    const prodTarget =
      targets &&
      typeof targets.production === "object" &&
      targets.production !== null
        ? (targets.production as Record<string, unknown>)
        : null;
    const aliases: string[] = Array.isArray(prodTarget?.alias)
      ? prodTarget.alias.map(String)
      : [];
    const primaryAlias = aliases[0] || (prodTarget?.url ? String(prodTarget.url) : "");
    const productionUrl = primaryAlias
      ? primaryAlias.startsWith("http")
        ? primaryAlias
        : `https://${primaryAlias}`
      : null;

    projectMap.set(name, {
      id,
      name,
      framework,
      productionUrl,
      repoSlug,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : null,
      workspaceAppId: matchWorkspaceAppId(name, aliases),
      latestDeployment: null,
      latestProductionDeployment: null,
    });
  }

  for (const d of deployments) {
    let summary = projectMap.get(d.name);
    if (!summary) {
      summary = {
        id: d.projectId || d.name,
        name: d.name,
        framework: null,
        productionUrl: d.target === "production" ? d.url : null,
        repoSlug: d.repoSlug,
        updatedAt: d.createdAt,
        workspaceAppId: matchWorkspaceAppId(d.name, d.url ? [d.url] : []),
        latestDeployment: null,
        latestProductionDeployment: null,
      };
      projectMap.set(d.name, summary);
    }
    if (!summary.latestDeployment) {
      summary.latestDeployment = d;
    }
    if (d.target === "production" && !summary.latestProductionDeployment) {
      summary.latestProductionDeployment = d;
      if (!summary.productionUrl && d.url) {
        summary.productionUrl = d.url;
      }
    }
    if (!summary.repoSlug && d.repoSlug) {
      summary.repoSlug = d.repoSlug;
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) => {
    const aTime = a.latestDeployment?.createdAt ?? a.updatedAt ?? 0;
    const bTime = b.latestDeployment?.createdAt ?? b.updatedAt ?? 0;
    return bTime - aTime;
  });

  const externalAppStatuses: VercelDashboardData["externalAppStatuses"] = {};
  for (const proj of projects) {
    const latest = proj.latestDeployment ?? proj.latestProductionDeployment;
    if (proj.workspaceAppId && latest) {
      externalAppStatuses[proj.workspaceAppId] = {
        projectName: proj.name,
        state: latest.state,
        url: proj.productionUrl || latest.url,
        updatedAt: latest.createdAt,
        branch: latest.branch,
        commitSha: latest.commitSha,
      };
    }
  }

  const counts = {
    total: deployments.length,
    ready: 0,
    building: 0,
    error: 0,
    queued: 0,
    canceled: 0,
  };

  for (const d of deployments) {
    if (d.state === "READY") counts.ready++;
    else if (d.state === "BUILDING" || d.state === "INITIALIZING")
      counts.building++;
    else if (d.state === "ERROR") counts.error++;
    else if (d.state === "QUEUED") counts.queued++;
    else if (d.state === "CANCELED") counts.canceled++;
  }

  return {
    config: clientConfig,
    deployments,
    projects,
    externalAppStatuses,
    counts,
    fetchedAt: new Date().toISOString(),
  };
}

export function normalizeBuildLogEvents(
  rawEvents: unknown,
): VercelBuildLogEvent[] {
  if (!Array.isArray(rawEvents)) return [];
  const events: VercelBuildLogEvent[] = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const item = rawEvents[i];
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const payload =
      typeof rec.payload === "object" && rec.payload !== null
        ? (rec.payload as Record<string, unknown>)
        : {};

    const text = String(
      rec.text ?? payload.text ?? payload.message ?? "",
    ).trimEnd();
    if (!text) continue;

    const type = String(rec.type ?? payload.type ?? "stdout");
    const timestamp = Number(
      rec.created ?? rec.date ?? payload.date ?? Date.now(),
    );
    const id = String(rec.id ?? payload.id ?? `evt-${i}-${timestamp}`);

    const lower = `${type} ${text}`.toLowerCase();
    let level: VercelBuildLogEvent["level"] = "info";
    if (
      type === "stderr" ||
      type === "error" ||
      lower.includes("error:") ||
      lower.includes("failed to compile") ||
      lower.includes("build error")
    ) {
      level = "error";
    } else if (lower.includes("warn") || lower.includes("warning")) {
      level = "warn";
    }

    events.push({ id, timestamp, text, type, level });
  }

  return events;
}

export async function fetchVercelDeploymentEvents(
  ownerId: string,
  deploymentId: string,
  options?: {
    fetchImpl?: typeof fetch;
    configOverride?: UserVercelConfig;
  },
): Promise<VercelBuildLogEvent[]> {
  const config =
    options?.configOverride ?? (await getUserVercelConfig(ownerId));
  if (!config.apiToken) {
    throw new Error("Vercel access token is not configured.");
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const url = buildVercelUrl(
    `/v3/deployments/${encodeURIComponent(deploymentId)}/events`,
    config.teamId,
    { limit: 250 },
  );

  const res = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let errText = `Failed to load build logs (HTTP ${res.status})`;
    try {
      const errJson = (await res.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) {
        errText = errJson.error.message;
      }
    } catch {}
    throw new Error(errText);
  }

  const json = await res.json();
  return normalizeBuildLogEvents(json);
}

export async function triggerVercelRedeploy(
  ownerId: string,
  input: {
    deploymentId: string;
    name: string;
    target?: VercelDeploymentTarget;
  },
  options?: {
    fetchImpl?: typeof fetch;
    configOverride?: UserVercelConfig;
  },
): Promise<VercelDeploymentItem> {
  const config =
    options?.configOverride ?? (await getUserVercelConfig(ownerId));
  if (!config.apiToken) {
    throw new Error("Vercel access token is not configured.");
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const url = buildVercelUrl("/v13/deployments", config.teamId, {
    forceNew: 1,
  });

  const body: Record<string, unknown> = {
    name: input.name,
    deploymentId: input.deploymentId,
  };
  if (input.target === "production") {
    body.target = "production";
  }

  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errText = `Vercel redeploy failed (HTTP ${res.status})`;
    try {
      const errJson = (await res.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) {
        errText = errJson.error.message;
      }
    } catch {}
    throw new Error(errText);
  }

  const json = (await res.json()) as Record<string, unknown>;
  return normalizeDeploymentRecord(json);
}

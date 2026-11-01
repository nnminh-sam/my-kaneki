import { NextResponse, type NextRequest } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import {
  fetchVercelDashboard,
  getUserVercelConfig,
  toClientVercelConfigView,
  type VercelDashboardData,
} from "@/lib/vercel";

export const dynamic = "force-dynamic";

export interface VercelDeploymentsApiResponse {
  ok: boolean;
  data?: VercelDashboardData;
  error?: string;
}

export async function GET(req: NextRequest) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json<VercelDeploymentsApiResponse>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("projectId") || undefined;
  const state = searchParams.get("state") || undefined;
  const target = searchParams.get("target") || undefined;
  const limitRaw = Number(searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  try {
    const data = await fetchVercelDashboard(owner, {
      projectId,
      state,
      target,
      limit,
    });
    return NextResponse.json<VercelDeploymentsApiResponse>({
      ok: true,
      data,
    });
  } catch (err) {
    const cfg = await getUserVercelConfig(owner).catch(() => ({
      ownerId: owner,
      apiToken: "",
      teamId: "",
      source: "none" as const,
    }));
    return NextResponse.json<VercelDeploymentsApiResponse>(
      {
        ok: false,
        data: {
          config: toClientVercelConfigView(cfg),
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
        },
        error:
          err instanceof Error
            ? err.message
            : "Failed to load Vercel deployments.",
      },
      { status: 200 },
    );
  }
}

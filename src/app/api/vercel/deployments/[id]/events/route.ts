import { NextResponse, type NextRequest } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import {
  fetchVercelDeploymentEvents,
  type VercelBuildLogEvent,
} from "@/lib/vercel";

export const dynamic = "force-dynamic";

export interface VercelEventsApiResponse {
  ok: boolean;
  events?: VercelBuildLogEvent[];
  error?: string;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json<VercelEventsApiResponse>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json<VercelEventsApiResponse>(
      { ok: false, error: "Missing deployment ID" },
      { status: 400 },
    );
  }

  try {
    const events = await fetchVercelDeploymentEvents(owner, id);
    return NextResponse.json<VercelEventsApiResponse>({
      ok: true,
      events,
    });
  } catch (err) {
    return NextResponse.json<VercelEventsApiResponse>(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load deployment build logs.",
      },
      { status: 200 },
    );
  }
}

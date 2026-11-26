import { NextResponse, type NextRequest } from "next/server";
import { requestOwnerId } from "@/lib/owner";
import { FEATURES, getEffectiveFlags } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const owner = await requestOwnerId(req);
  if (owner === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const flags = await getEffectiveFlags(owner);
  const features = FEATURES.map((feature) => ({
    id: feature.id,
    label: feature.label,
    description: feature.description,
    stage: feature.stage,
    enabled: flags[feature.id].enabled,
    forcedOff: flags[feature.id].forcedOff,
  }));
  return NextResponse.json({ features });
}

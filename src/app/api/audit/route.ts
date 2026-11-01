import { NextResponse, type NextRequest } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import { querySessionAuditLogs, type SessionAuditCategory } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ownerId = await currentOwnerId();
  if (ownerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId") || undefined;
  const category = (searchParams.get("category") as SessionAuditCategory | "all" | null) || "all";
  const status = (searchParams.get("status") as "all" | "success" | "error" | null) || "all";
  const search = searchParams.get("search") || undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 250;

  try {
    const data = await querySessionAuditLogs(ownerId, {
      sessionId,
      category,
      status,
      search,
      limit: Number.isFinite(limit) ? limit : 250,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to query session audit logs:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load audit logs" },
      { status: 500 },
    );
  }
}

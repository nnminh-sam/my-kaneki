import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import { getChatSessionMessages } from "@/lib/chat-db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const beforeParam = url.searchParams.get("before");

  const limit = limitParam ? parseInt(limitParam, 10) : 25;
  const before = beforeParam || undefined;

  try {
    const result = await getChatSessionMessages(owner, id, {
      limit: Number.isNaN(limit) ? 25 : limit,
      before,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to get chat session messages:", err);
    return NextResponse.json(
      { error: "Failed to retrieve messages" },
      { status: 500 },
    );
  }
}

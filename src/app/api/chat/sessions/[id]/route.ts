import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import { deleteChatSession, getChatSession, renameChatSession, upsertChatSession } from "@/lib/chat-db";
import type { UIMessage } from "ai";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const session = await getChatSession(owner, id);
    if (!session) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    console.error("Failed to get chat session:", err);
    return NextResponse.json({ error: "Failed to retrieve chat session" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = (await req.json()) as {
      title?: string;
      messages?: UIMessage[];
      updatedAt?: string;
    };

    if (body.title !== undefined && body.messages === undefined) {
      const session = await renameChatSession(owner, id, body.title);
      if (!session) {
        return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
      }
      return NextResponse.json({ session });
    }

    const session = await upsertChatSession(owner, {
      id,
      title: body.title,
      messages: body.messages,
      updatedAt: body.updatedAt,
    });

    return NextResponse.json({ session });
  } catch (err) {
    console.error("Failed to update chat session:", err);
    return NextResponse.json({ error: "Failed to update chat session" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteChatSession(owner, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete chat session:", err);
    return NextResponse.json({ error: "Failed to delete chat session" }, { status: 500 });
  }
}

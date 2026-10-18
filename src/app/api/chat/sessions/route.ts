import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import { listChatSessions, upsertChatSession } from "@/lib/chat-db";
import type { UIMessage } from "ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await listChatSessions(owner);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("Failed to list chat sessions:", err);
    return NextResponse.json({ error: "Failed to load chat sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      title?: string;
      messages?: UIMessage[];
      createdAt?: string;
      updatedAt?: string;
    };

    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "Missing or invalid session id" }, { status: 400 });
    }

    const session = await upsertChatSession(owner, {
      id: body.id,
      title: body.title,
      messages: body.messages,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    });

    return NextResponse.json({ session });
  } catch (err) {
    console.error("Failed to upsert chat session:", err);
    return NextResponse.json({ error: "Failed to save chat session" }, { status: 500 });
  }
}

import { redirect } from "next/navigation";
import { OverviewChatApp } from "@/components/chat/OverviewChatApp";
import { currentOwnerId } from "@/lib/owner";
import { listChatSessions, upsertChatSession } from "@/lib/chat-db";
import { createNewSession, type ChatSession } from "@/lib/chat-sessions";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const owner = await currentOwnerId();
  if (owner === null) redirect("/login");

  let sessions: ChatSession[] = [];
  try {
    sessions = await listChatSessions(owner);
    if (sessions.length === 0) {
      const initial = createNewSession();
      await upsertChatSession(owner, initial);
      sessions = [initial];
    }
  } catch (err) {
    console.error("Failed to load chat sessions from DB:", err);
  }

  return (
    <div className="flex flex-1 h-full w-full overflow-hidden">
      <OverviewChatApp initialSessions={sessions} />
    </div>
  );
}

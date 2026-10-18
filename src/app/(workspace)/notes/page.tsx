import { redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { NoteEditor } from "@/components/NoteEditor";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const owner = await currentOwnerId();
  if (owner === null) redirect("/login?next=/notes");

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden p-4 sm:p-5">
      <NoteEditor repoPath="notes/inbox.md" />
    </div>
  );
}

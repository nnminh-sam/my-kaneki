import { redirect } from "next/navigation";
import { getSettingsSnapshotAction } from "@/actions/settings";
import { SettingsView } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function AiProviderPage() {
  const snap = await getSettingsSnapshotAction();
  if (!snap.ok || !snap.aiSettings) {
    redirect("/login");
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <SettingsView
        initialMcpKeys={snap.mcpKeys ?? []}
        initialAiSettings={snap.aiSettings}
      />
    </div>
  );
}

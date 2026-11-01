import { redirect } from "next/navigation";
import { getVercelDashboardAction } from "@/actions/vercel";
import { DeploymentsView } from "@/components/deployments/DeploymentsView";
import { currentOwnerId } from "@/lib/owner";
import { getUserVercelConfig, toClientVercelConfigView } from "@/lib/vercel";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const res = await getVercelDashboardAction();
  const fallbackConfig = toClientVercelConfigView(
    await getUserVercelConfig(owner),
  );

  const initialData = res.data ?? {
    config: fallbackConfig,
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
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <DeploymentsView
        initialData={initialData}
        initialError={res.ok ? null : res.error}
      />
    </div>
  );
}

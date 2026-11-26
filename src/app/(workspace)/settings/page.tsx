import { currentOwnerId } from "@/lib/owner";
import { FEATURES, getEffectiveFlags } from "@/lib/features";
import { FeaturesSettings, type FeatureSettingsRow } from "@/components/settings/FeaturesSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const owner = await currentOwnerId();

  if (owner === null) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted">Sign in to change feature switches.</p>
      </div>
    );
  }

  const flags = await getEffectiveFlags(owner);
  const rows: FeatureSettingsRow[] = FEATURES.map((feature) => ({
    id: feature.id,
    label: feature.label,
    description: feature.description,
    stage: feature.stage,
    enabled: flags[feature.id].enabled,
    forcedOff: flags[feature.id].forcedOff,
  }));

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Features</h1>
      <p className="mt-1 text-sm text-muted">Turn workspace features on or off for your account.</p>
      <div className="mt-4">
        <FeaturesSettings features={rows} />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFeatureAction } from "@/actions/features";

export interface FeatureSettingsRow {
  id: string;
  label: string;
  description: string;
  stage: "dev" | "beta" | "released";
  enabled: boolean;
  forcedOff: boolean;
}

const STAGE_LABEL: Record<FeatureSettingsRow["stage"], string> = {
  dev: "Dev",
  beta: "Beta",
  released: "Released",
};

export function FeaturesSettings({ features }: { features: FeatureSettingsRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(feature: FeatureSettingsRow) {
    setBusyId(feature.id);
    setError(null);
    try {
      const result = await setFeatureAction(feature.id, !feature.enabled);
      if (!result.ok) {
        setError(result.error ?? "Could not save the setting.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save the setting. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {features.map((feature) => {
        const inputId = `feature-${feature.id}`;
        const busy = busyId === feature.id;
        return (
          <div key={feature.id} className="flex items-start justify-between gap-4 rounded border border-border p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="font-medium">
                  {feature.label}
                </label>
                <span className="rounded bg-muted/20 px-1.5 py-0.5 text-xs">{STAGE_LABEL[feature.stage]}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{feature.description}</p>
              {feature.forcedOff && (
                <p className="mt-1 text-sm text-muted">Switched off by the server configuration.</p>
              )}
            </div>
            <input
              id={inputId}
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-5 shrink-0"
              checked={feature.enabled}
              disabled={feature.forcedOff || busy}
              aria-busy={busy}
              onChange={() => void toggle(feature)}
            />
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

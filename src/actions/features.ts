"use server";

import { revalidatePath } from "next/cache";
import { currentOwnerId } from "@/lib/owner";
import { getDb } from "@/lib/db";
import { disabledFeaturesFromEnv, featureToggleStatements, isFeatureId } from "@/lib/features";

export interface SetFeatureActionResult {
  ok: boolean;
  error?: string;
}

/** Turns a feature on or off for the signed-in owner. The flag change and its audit row commit together. */
export async function setFeatureAction(feature: string, enabled: boolean): Promise<SetFeatureActionResult> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  if (!isFeatureId(feature)) return { ok: false, error: "Unknown feature." };
  if (typeof enabled !== "boolean") return { ok: false, error: "Invalid value." };

  if (disabledFeaturesFromEnv().has(feature)) {
    return { ok: false, error: "This feature is switched off by the server configuration." };
  }

  try {
    await getDb().transaction([
      ...featureToggleStatements(owner, feature, enabled),
      {
        text: `insert into audit_log (action, entity_type, entity_id, actor, payload)
               values ('feature.toggle', 'feature', $1, 'user',
                       jsonb_build_object('ownerId', $2::text, 'owner_id', $2::text, 'feature', $1::text, 'enabled', $3::boolean))`,
        params: [feature, owner, enabled],
      },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save the setting: ${message}` };
  }

  try {
    revalidatePath("/", "layout");
  } catch {
    // The change is already saved; the next navigation shows it.
  }
  return { ok: true };
}

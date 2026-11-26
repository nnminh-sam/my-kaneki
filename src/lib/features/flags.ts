import { getDb, type Db } from "@/lib/db";
import { FEATURES, featureDefinition, isFeatureId, type FeatureId } from "./registry";

export const FEATURE_DISABLED_MESSAGE_PREFIX = "Feature disabled:";

/** Message returned when a feature is switched off. Built from the id so the text lives in one place. */
export function featureDisabledMessage(feature: FeatureId): string {
  return `${FEATURE_DISABLED_MESSAGE_PREFIX} ${feature}`;
}

export interface EffectiveFlag {
  enabled: boolean;
  forcedOff: boolean;
}

export type EffectiveFlags = Record<FeatureId, EffectiveFlag>;

/** Features forced off by the KANEKI_DISABLED_FEATURES environment variable (comma-separated). Unknown ids are ignored. */
export function disabledFeaturesFromEnv(env: { readonly [key: string]: string | undefined } = process.env): Set<FeatureId> {
  const raw = env.KANEKI_DISABLED_FEATURES ?? "";
  const forced = new Set<FeatureId>();
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (isFeatureId(id)) forced.add(id);
  }
  return forced;
}

/**
 * Effective state of every registry feature for an owner.
 * Precedence: environment force-off, then the stored row, then the registry default.
 * Never throws: a failed database read falls back to registry defaults; the environment still applies.
 */
export async function getEffectiveFlags(ownerId: string, deps: { db?: () => Db } = {}): Promise<EffectiveFlags> {
  const forced = disabledFeaturesFromEnv();
  const stored = new Map<string, boolean>();
  try {
    const db = deps.db ? deps.db() : getDb();
    const rows = await db.query(`select feature, enabled from feature_flags where owner_id = $1`, [ownerId]);
    for (const row of rows) stored.set(String(row.feature), Boolean(row.enabled));
  } catch {
    // Fail open to registry defaults: a missing or unreachable flag table must not break requests.
  }

  const result = {} as EffectiveFlags;
  for (const feature of FEATURES) {
    const id = feature.id as FeatureId;
    const forcedOff = forced.has(id);
    const base = stored.has(id) ? (stored.get(id) as boolean) : featureDefinition(id).defaultEnabled;
    result[id] = { enabled: forcedOff ? false : base, forcedOff };
  }
  return result;
}

export async function isFeatureEnabled(ownerId: string, feature: FeatureId, deps: { db?: () => Db } = {}): Promise<boolean> {
  return (await getEffectiveFlags(ownerId, deps))[feature].enabled;
}

/** Statements that record a toggle for one owner (upsert only; the caller owns the transaction). */
export function featureToggleStatements(ownerId: string, feature: FeatureId, enabled: boolean) {
  return [
    {
      text: `insert into feature_flags (owner_id, feature, enabled, updated_at)
             values ($1, $2, $3, now())
             on conflict (owner_id, feature) do update set enabled = excluded.enabled, updated_at = now()`,
      params: [ownerId, feature, enabled],
    },
  ];
}

/** Feature registry: the single list of user-toggleable features and their defaults. */

export type FeatureStage = "dev" | "beta" | "released";

export interface FeatureDefinition {
  id: string;
  label: string;
  description: string;
  stage: FeatureStage;
  defaultEnabled: boolean;
}

export const FEATURES = [
  {
    id: "lms",
    label: "Learning",
    description: "Learning subjects, sources, study review and the LMS agent tools.",
    stage: "released",
    defaultEnabled: true,
  },
] as const satisfies readonly FeatureDefinition[];

export type FeatureId = (typeof FEATURES)[number]["id"];

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && FEATURES.some((feature) => feature.id === value);
}

export function featureDefinition(id: FeatureId): FeatureDefinition {
  const found = FEATURES.find((feature) => feature.id === id);
  if (!found) throw new Error(`Unknown feature id: ${id}`);
  return found;
}

// Storybook-only mock of the "@/actions/lms" server actions (registered with sb.mock in .storybook/preview.tsx).
// Stories never reach the database; each action resolves like a successful call so the UI flow can be clicked through.
import { fn } from "storybook/test";

export const startPlacementAction = fn(async (_subjectSlug: string) => ({ ok: true as const, quizId: "quiz_pl_8" })).mockName(
  "startPlacementAction",
);
export const submitQuizAction = fn(async () => ({ ok: true as const })).mockName("submitQuizAction");
export const resolveEscalationAction = fn(async () => ({ ok: true as const })).mockName("resolveEscalationAction");
export const deleteSourceAction = fn(async () => ({ ok: true as const })).mockName("deleteSourceAction");
export const updateNodeStatusAction = fn(async () => ({ ok: true as const })).mockName("updateNodeStatusAction");

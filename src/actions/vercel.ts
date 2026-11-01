"use server";

import { revalidatePath } from "next/cache";
import { currentOwnerId } from "@/lib/owner";
import { recordAudit } from "@/lib/audit";
import {
  fetchVercelDashboard,
  saveUserVercelConfig,
  toClientVercelConfigView,
  triggerVercelRedeploy,
  type ClientVercelConfigView,
  type VercelDashboardData,
  type VercelDeploymentItem,
  type VercelDeploymentTarget,
} from "@/lib/vercel";

export async function getVercelDashboardAction(): Promise<{
  ok: boolean;
  data?: VercelDashboardData;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const data = await fetchVercelDashboard(owner);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load Vercel deployments",
    };
  }
}

export async function saveVercelConfigAction(input: {
  apiToken?: string;
  teamId?: string;
  clearToken?: boolean;
}): Promise<{
  ok: boolean;
  config?: ClientVercelConfigView;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const saved = await saveUserVercelConfig(owner, input);
    await recordAudit({
      action: input.clearToken ? "vercel.config.clear" : "vercel.config.update",
      entityType: "user_vercel_config",
      entityId: owner || "default",
      actor: "user",
      payload: {
        hasToken: Boolean(saved.apiToken),
        teamId: saved.teamId || null,
      },
    }).catch(() => {});

    revalidatePath("/deployments");
    revalidatePath("/ai-provider");
    return {
      ok: true,
      config: toClientVercelConfigView(saved),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to save Vercel configuration",
    };
  }
}

export async function redeployVercelDeploymentAction(input: {
  deploymentId: string;
  name: string;
  target?: VercelDeploymentTarget;
}): Promise<{
  ok: boolean;
  deployment?: VercelDeploymentItem;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const created = await triggerVercelRedeploy(owner, input);
    await recordAudit({
      action: "vercel.deployment.redeploy",
      entityType: "vercel_deployment",
      entityId: created.id || input.deploymentId,
      actor: "user",
      payload: {
        sourceDeploymentId: input.deploymentId,
        projectName: input.name,
        target: input.target ?? "preview",
        url: created.url,
      },
    }).catch(() => {});

    revalidatePath("/deployments");
    return { ok: true, deployment: created };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to trigger redeploy",
    };
  }
}

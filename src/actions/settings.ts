"use server";

import { revalidatePath } from "next/cache";
import { currentOwnerId } from "@/lib/owner";
import {
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  type CreatedMcpApiKey,
  type McpApiKeyRecord,
} from "@/lib/auth";
import {
  AI_PROVIDER_CATALOG,
  getUserAiConfig,
  saveUserAiConfig,
  maskSecret,
  type ChatProviderId,
  type EmbeddingProviderId,
  type ProvidersCredentialMap,
} from "@/lib/ai";
import { recordAudit } from "@/lib/audit";

export interface MaskedProviderCredentials {
  hasApiKey: boolean;
  maskedApiKey: string;
  baseUrl: string;
  preferredChatModels: string[];
  preferredEmbeddingModels: string[];
}

export interface ClientAiSettingsView {
  chatProvider: ChatProviderId;
  chatModel: string;
  embeddingProvider: EmbeddingProviderId;
  embeddingModel: string;
  providers: Record<ChatProviderId, MaskedProviderCredentials>;
  updatedAt?: string;
}

export async function getSettingsSnapshotAction(): Promise<{
  ok: boolean;
  mcpKeys?: McpApiKeyRecord[];
  aiSettings?: ClientAiSettingsView;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const [mcpKeys, aiConfig] = await Promise.all([
      listMcpApiKeys(owner),
      getUserAiConfig(owner),
    ]);

    const providers: Record<ChatProviderId, MaskedProviderCredentials> = {
      ollama: {
        hasApiKey: Boolean(aiConfig.providers.ollama?.apiKey),
        maskedApiKey: maskSecret(aiConfig.providers.ollama?.apiKey),
        baseUrl: aiConfig.providers.ollama?.baseUrl || "",
        preferredChatModels:
          aiConfig.providers.ollama?.preferredChatModels ??
          AI_PROVIDER_CATALOG.ollama.chatModelPresets,
        preferredEmbeddingModels:
          aiConfig.providers.ollama?.preferredEmbeddingModels ??
          AI_PROVIDER_CATALOG.ollama.embeddingModelPresets,
      },
      openrouter: {
        hasApiKey: Boolean(aiConfig.providers.openrouter?.apiKey),
        maskedApiKey: maskSecret(aiConfig.providers.openrouter?.apiKey),
        baseUrl: aiConfig.providers.openrouter?.baseUrl || "",
        preferredChatModels:
          aiConfig.providers.openrouter?.preferredChatModels ??
          AI_PROVIDER_CATALOG.openrouter.chatModelPresets,
        preferredEmbeddingModels:
          aiConfig.providers.openrouter?.preferredEmbeddingModels ??
          AI_PROVIDER_CATALOG.openrouter.embeddingModelPresets,
      },
      openai: {
        hasApiKey: Boolean(aiConfig.providers.openai?.apiKey),
        maskedApiKey: maskSecret(aiConfig.providers.openai?.apiKey),
        baseUrl: aiConfig.providers.openai?.baseUrl || "",
        preferredChatModels:
          aiConfig.providers.openai?.preferredChatModels ??
          AI_PROVIDER_CATALOG.openai.chatModelPresets,
        preferredEmbeddingModels:
          aiConfig.providers.openai?.preferredEmbeddingModels ??
          AI_PROVIDER_CATALOG.openai.embeddingModelPresets,
      },
      custom: {
        hasApiKey: Boolean(aiConfig.providers.custom?.apiKey),
        maskedApiKey: maskSecret(aiConfig.providers.custom?.apiKey),
        baseUrl: aiConfig.providers.custom?.baseUrl || "",
        preferredChatModels:
          aiConfig.providers.custom?.preferredChatModels ??
          AI_PROVIDER_CATALOG.custom.chatModelPresets,
        preferredEmbeddingModels:
          aiConfig.providers.custom?.preferredEmbeddingModels ??
          AI_PROVIDER_CATALOG.custom.embeddingModelPresets,
      },
    };

    return {
      ok: true,
      mcpKeys,
      aiSettings: {
        chatProvider: aiConfig.chatProvider,
        chatModel: aiConfig.chatModel,
        embeddingProvider: aiConfig.embeddingProvider,
        embeddingModel: aiConfig.embeddingModel,
        providers,
        updatedAt: aiConfig.updatedAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load settings",
    };
  }
}

export async function generateMcpApiKeyAction(name: string): Promise<{
  ok: boolean;
  key?: CreatedMcpApiKey;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const created = await createMcpApiKey(owner, name);
    await recordAudit({
      action: "mcp.api_key.create",
      entityType: "mcp_api_key",
      entityId: created.id,
      actor: "user",
      payload: { name: created.name, keyPrefix: created.keyPrefix },
    }).catch(() => {});
    revalidatePath("/ai-provider");
    return { ok: true, key: created };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate MCP API key",
    };
  }
}

export async function revokeMcpApiKeyAction(keyId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    const revoked = await revokeMcpApiKey(owner, keyId);
    if (!revoked) {
      return { ok: false, error: "API key not found or already revoked" };
    }
    await recordAudit({
      action: "mcp.api_key.revoke",
      entityType: "mcp_api_key",
      entityId: keyId,
      actor: "user",
      payload: {},
    }).catch(() => {});
    revalidatePath("/ai-provider");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to revoke MCP API key",
    };
  }
}

export async function saveAiSettingsAction(input: {
  chatProvider: ChatProviderId;
  chatModel: string;
  embeddingProvider: EmbeddingProviderId;
  embeddingModel: string;
  providers: ProvidersCredentialMap;
}): Promise<{
  ok: boolean;
  aiSettings?: ClientAiSettingsView;
  error?: string;
}> {
  const owner = await currentOwnerId();
  if (owner === null) return { ok: false, error: "Unauthorized" };

  try {
    await saveUserAiConfig(owner, input);
    await recordAudit({
      action: "ai.config.update",
      entityType: "user_ai_config",
      entityId: owner || "default",
      actor: "user",
      payload: {
        chatProvider: input.chatProvider,
        chatModel: input.chatModel,
        embeddingProvider: input.embeddingProvider,
        embeddingModel: input.embeddingModel,
      },
    }).catch(() => {});
    revalidatePath("/ai-provider");
    const snap = await getSettingsSnapshotAction();
    return { ok: true, aiSettings: snap.aiSettings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save AI provider configuration",
    };
  }
}

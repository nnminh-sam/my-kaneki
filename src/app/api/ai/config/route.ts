import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/owner";
import {
  AI_PROVIDER_CATALOG,
  getUserAiConfig,
  saveUserAiConfig,
  type ChatProviderId,
  type EmbeddingProviderId,
} from "@/lib/ai";

export async function GET() {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getUserAiConfig(owner);
  const preferredModels: Record<
    ChatProviderId,
    { chatModels: string[]; embeddingModels: string[] }
  > = {
    ollama: {
      chatModels:
        config.providers.ollama?.preferredChatModels ??
        AI_PROVIDER_CATALOG.ollama.chatModelPresets,
      embeddingModels:
        config.providers.ollama?.preferredEmbeddingModels ??
        AI_PROVIDER_CATALOG.ollama.embeddingModelPresets,
    },
    openrouter: {
      chatModels:
        config.providers.openrouter?.preferredChatModels ??
        AI_PROVIDER_CATALOG.openrouter.chatModelPresets,
      embeddingModels:
        config.providers.openrouter?.preferredEmbeddingModels ??
        AI_PROVIDER_CATALOG.openrouter.embeddingModelPresets,
    },
    openai: {
      chatModels:
        config.providers.openai?.preferredChatModels ??
        AI_PROVIDER_CATALOG.openai.chatModelPresets,
      embeddingModels:
        config.providers.openai?.preferredEmbeddingModels ??
        AI_PROVIDER_CATALOG.openai.embeddingModelPresets,
    },
    custom: {
      chatModels:
        config.providers.custom?.preferredChatModels ??
        AI_PROVIDER_CATALOG.custom.chatModelPresets,
      embeddingModels:
        config.providers.custom?.preferredEmbeddingModels ??
        AI_PROVIDER_CATALOG.custom.embeddingModelPresets,
    },
  };

  return NextResponse.json({
    chatProvider: config.chatProvider,
    chatModel: config.chatModel,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    configuredProviders: {
      ollama: Boolean(config.providers.ollama?.apiKey || config.providers.ollama?.baseUrl),
      openrouter: Boolean(config.providers.openrouter?.apiKey),
      openai: Boolean(config.providers.openai?.apiKey),
      custom: Boolean(config.providers.custom?.apiKey || config.providers.custom?.baseUrl),
    },
    preferredModels,
    catalog: AI_PROVIDER_CATALOG,
  });
}

export async function PATCH(req: Request) {
  const owner = await currentOwnerId();
  if (owner === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      chatProvider?: ChatProviderId;
      chatModel?: string;
      embeddingProvider?: EmbeddingProviderId;
      embeddingModel?: string;
    };

    const current = await getUserAiConfig(owner);
    const nextChatProvider = body.chatProvider ?? current.chatProvider;
    const nextChatModel =
      body.chatModel !== undefined
        ? body.chatModel.trim() || AI_PROVIDER_CATALOG[nextChatProvider].defaultChatModel
        : body.chatProvider && body.chatProvider !== current.chatProvider
          ? AI_PROVIDER_CATALOG[nextChatProvider].defaultChatModel
          : current.chatModel;

    const nextEmbeddingProvider = body.embeddingProvider ?? current.embeddingProvider;
    const nextEmbeddingModel =
      body.embeddingModel !== undefined
        ? body.embeddingModel.trim()
        : body.embeddingProvider && body.embeddingProvider !== current.embeddingProvider
          ? nextEmbeddingProvider === "deterministic"
            ? ""
            : AI_PROVIDER_CATALOG[nextEmbeddingProvider].defaultEmbeddingModel
          : current.embeddingModel;

    const nextProviders = { ...current.providers };
    if (body.chatModel?.trim()) {
      const prev = nextProviders[nextChatProvider] ?? {};
      const existingList =
        prev.preferredChatModels ??
        AI_PROVIDER_CATALOG[nextChatProvider].chatModelPresets;
      nextProviders[nextChatProvider] = {
        ...prev,
        preferredChatModels: Array.from(
          new Set([...existingList, nextChatModel]),
        ),
      };
    }

    if (body.embeddingModel?.trim() && nextEmbeddingProvider !== "deterministic") {
      const prev = nextProviders[nextEmbeddingProvider] ?? {};
      const existingList =
        prev.preferredEmbeddingModels ??
        AI_PROVIDER_CATALOG[nextEmbeddingProvider].embeddingModelPresets;
      nextProviders[nextEmbeddingProvider] = {
        ...prev,
        preferredEmbeddingModels: Array.from(
          new Set([...existingList, nextEmbeddingModel]),
        ),
      };
    }

    const updated = await saveUserAiConfig(owner, {
      chatProvider: nextChatProvider,
      chatModel: nextChatModel,
      embeddingProvider: nextEmbeddingProvider,
      embeddingModel: nextEmbeddingModel,
      providers: nextProviders,
    });

    return NextResponse.json({
      ok: true,
      chatProvider: updated.chatProvider,
      chatModel: updated.chatModel,
      embeddingProvider: updated.embeddingProvider,
      embeddingModel: updated.embeddingModel,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update AI model" },
      { status: 400 },
    );
  }
}

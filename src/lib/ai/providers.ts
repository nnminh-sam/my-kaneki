import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getDb } from "@/lib/db";
import {
  createDeterministicFakeEmbedder,
  createHttpEmbedder,
  type Embedder,
} from "@/lib/lms/embeddings";

export type ChatProviderId = "ollama" | "openrouter" | "openai" | "custom";
export type EmbeddingProviderId =
  | "openrouter"
  | "ollama"
  | "openai"
  | "custom"
  | "deterministic";

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  preferredChatModels?: string[];
  preferredEmbeddingModels?: string[];
}

export type ProvidersCredentialMap = Partial<Record<ChatProviderId, ProviderCredentials>>;

export interface UserAiConfig {
  ownerId: string;
  chatProvider: ChatProviderId;
  chatModel: string;
  embeddingProvider: EmbeddingProviderId;
  embeddingModel: string;
  providers: ProvidersCredentialMap;
  updatedAt?: string;
}

export interface ProviderCatalogEntry {
  id: ChatProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  chatModelPresets: string[];
  embeddingModelPresets: string[];
  headers?: Record<string, string>;
}

export const AI_PROVIDER_CATALOG: Record<ChatProviderId, ProviderCatalogEntry> = {
  ollama: {
    id: "ollama",
    label: "Ollama (Cloud / Local)",
    defaultBaseUrl: "https://ollama.com/v1",
    defaultChatModel: "gemma4:31b-cloud",
    defaultEmbeddingModel: "nomic-embed-text",
    chatModelPresets: [
      "gemma4:31b-cloud",
      "gpt-oss:120b",
      "qwen3:32b",
      "llama3.3:70b",
    ],
    embeddingModelPresets: [
      "nomic-embed-text",
      "mxbai-embed-large",
      "bge-m3",
    ],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultChatModel: "openrouter/free",
    defaultEmbeddingModel: "openai/text-embedding-3-small",
    chatModelPresets: [
      "openrouter/free",
      "google/gemma-4-31b-it:free",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.7-sonnet",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat-v3-0324",
    ],
    embeddingModelPresets: [
      "openai/text-embedding-3-small",
      "openai/text-embedding-3-large",
      "qwen/qwen3-embedding-8b",
      "mistralai/mistral-embed-2312",
    ],
    headers: {
      "HTTP-Referer": "https://kaneki.local",
      "X-Title": "my_kaneki",
    },
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultChatModel: "gpt-4o-mini",
    defaultEmbeddingModel: "text-embedding-3-small",
    chatModelPresets: [
      "gpt-4o-mini",
      "gpt-4o",
      "o3-mini",
    ],
    embeddingModelPresets: [
      "text-embedding-3-small",
      "text-embedding-3-large",
    ],
  },
  custom: {
    id: "custom",
    label: "Custom OpenAI-Compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultChatModel: "gpt-4o-mini",
    defaultEmbeddingModel: "text-embedding-3-small",
    chatModelPresets: [],
    embeddingModelPresets: [],
  },
};

const VALID_CHAT_PROVIDERS = new Set<ChatProviderId>([
  "ollama",
  "openrouter",
  "openai",
  "custom",
]);

const VALID_EMBEDDING_PROVIDERS = new Set<EmbeddingProviderId>([
  "openrouter",
  "ollama",
  "openai",
  "custom",
  "deterministic",
]);

/**
 * Sanitizes a model ID string:
 * Model IDs never contain spaces. If a user accidentally copy-pastes surrounding prose
 * (e.g. "select openrouter/free directly"), extracts the token containing `/` or `:`.
 */
export function sanitizeModelId(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (!/\s/.test(trimmed)) return trimmed;
  const tokens = trimmed.split(/\s+/);
  const slashOrColonToken = tokens.find((t) => t.includes("/") || t.includes(":"));
  return slashOrColonToken || tokens[0] || "";
}

/**
 * Normalizes an OpenAI-compatible base URL:
 * - Strips endpoint suffixes like `/responses`, `/chat/completions`, `/embeddings`, `/completions`, `/models`
 *   if a user pastes a full endpoint URL instead of the `/v1` base URL.
 * - Normalizes Ollama (`/api` -> `/v1`), OpenRouter (`/api/v1`), and OpenAI (`/v1`).
 */
export function normalizeProviderBaseUrl(
  provider: ChatProviderId,
  rawUrl?: string,
): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return AI_PROVIDER_CATALOG[provider].defaultBaseUrl;
  }
  let clean = trimmed
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|responses|embeddings|completions|models)$/i, "")
    .replace(/\/+$/, "");

  if (provider === "openrouter" || clean.includes("openrouter.ai")) {
    if (clean.endsWith("openrouter.ai")) {
      return `${clean}/api/v1`;
    }
    if (clean.endsWith("openrouter.ai/api")) {
      return `${clean}/v1`;
    }
    return clean;
  }

  if (provider === "ollama") {
    if (clean.endsWith("/api")) {
      return clean.slice(0, -4) + "/v1";
    }
    if (!clean.endsWith("/v1")) {
      return `${clean}/v1`;
    }
  }

  if (provider === "openai" && clean.endsWith("api.openai.com")) {
    return `${clean}/v1`;
  }

  return clean;
}

/**
 * Reads default AI provider configuration from environment variables when no DB row exists.
 */
export function getEnvFallbackAiConfig(
  ownerId = "",
  env: Record<string, string | undefined> = process.env,
): UserAiConfig {
  const hasOpenRouterKey = Boolean(env.OPENROUTER_API_KEY?.trim());
  const hasOllamaKey = Boolean(env.OLLAMA_API_KEY?.trim());
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY?.trim());

  const defaultChatProvider: ChatProviderId = hasOllamaKey
    ? "ollama"
    : hasOpenRouterKey
      ? "openrouter"
      : hasOpenAiKey
        ? "openai"
        : "ollama";

  const lmsEmbedBase = env.LMS_EMBEDDING_BASE_URL?.trim() || "";
  let defaultEmbeddingProvider: EmbeddingProviderId = "deterministic";
  if (lmsEmbedBase.includes("openrouter.ai") || (!lmsEmbedBase && hasOpenRouterKey)) {
    defaultEmbeddingProvider = "openrouter";
  } else if (lmsEmbedBase.includes("openai.com") && (env.LMS_EMBEDDING_API_KEY?.trim() || hasOpenAiKey)) {
    defaultEmbeddingProvider = "openai";
  } else if (lmsEmbedBase.includes("ollama") || (!lmsEmbedBase && hasOllamaKey && env.LMS_EMBEDDING_API_KEY?.trim())) {
    defaultEmbeddingProvider = "ollama";
  } else if (env.LMS_EMBEDDING_API_KEY?.trim() || lmsEmbedBase) {
    defaultEmbeddingProvider = "custom";
  }

  return {
    ownerId,
    chatProvider: defaultChatProvider,
    chatModel:
      env.OLLAMA_MODEL?.trim() ||
      AI_PROVIDER_CATALOG[defaultChatProvider].defaultChatModel,
    embeddingProvider: defaultEmbeddingProvider,
    embeddingModel:
      env.LMS_EMBEDDING_MODEL?.trim() ||
      (defaultEmbeddingProvider === "deterministic"
        ? AI_PROVIDER_CATALOG.openrouter.defaultEmbeddingModel
        : AI_PROVIDER_CATALOG[defaultEmbeddingProvider].defaultEmbeddingModel),
    providers: {
      ollama: {
        apiKey: env.OLLAMA_API_KEY?.trim() || undefined,
        baseUrl: env.OLLAMA_BASE_URL?.trim() || undefined,
        preferredChatModels: AI_PROVIDER_CATALOG.ollama.chatModelPresets,
        preferredEmbeddingModels: AI_PROVIDER_CATALOG.ollama.embeddingModelPresets,
      },
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY?.trim() || undefined,
        baseUrl: env.OPENROUTER_BASE_URL?.trim() || undefined,
        preferredChatModels: AI_PROVIDER_CATALOG.openrouter.chatModelPresets,
        preferredEmbeddingModels: AI_PROVIDER_CATALOG.openrouter.embeddingModelPresets,
      },
      openai: {
        apiKey: env.OPENAI_API_KEY?.trim() || env.LMS_EMBEDDING_API_KEY?.trim() || undefined,
        baseUrl: env.LMS_EMBEDDING_BASE_URL?.trim() || undefined,
        preferredChatModels: AI_PROVIDER_CATALOG.openai.chatModelPresets,
        preferredEmbeddingModels: AI_PROVIDER_CATALOG.openai.embeddingModelPresets,
      },
      custom: {
        apiKey: env.LMS_EMBEDDING_API_KEY?.trim() || undefined,
        baseUrl: env.LMS_EMBEDDING_BASE_URL?.trim() || undefined,
        preferredChatModels: AI_PROVIDER_CATALOG.custom.chatModelPresets,
        preferredEmbeddingModels: AI_PROVIDER_CATALOG.custom.embeddingModelPresets,
      },
    },
  };
}

/**
 * Loads the effective AI configuration for `ownerId`, merging DB `user_ai_configs`
 * over `.env` fallback values.
 */
export async function getUserAiConfig(
  ownerId = "",
  env: Record<string, string | undefined> = process.env,
): Promise<UserAiConfig> {
  const fallback = getEnvFallbackAiConfig(ownerId, env);

  try {
    const db = getDb();
    const rows = await db.query(
      `select owner_id, chat_provider, chat_model, embedding_provider, embedding_model, providers, updated_at
       from user_ai_configs
       where owner_id = $1`,
      [ownerId],
    );

    if (rows.length === 0 && ownerId !== "") {
      // Also check system-wide default owner_id = '' if user hasn't customized their own row yet
      const defaultRows = await db.query(
        `select owner_id, chat_provider, chat_model, embedding_provider, embedding_model, providers, updated_at
         from user_ai_configs
         where owner_id = ''`,
      );
      if (defaultRows.length > 0) {
        return mergeDbRowWithFallback(ownerId, defaultRows[0], fallback);
      }
    }

    if (rows.length === 0) {
      return fallback;
    }

    return mergeDbRowWithFallback(ownerId, rows[0], fallback);
  } catch {
    return fallback;
  }
}

function mergeDbRowWithFallback(
  ownerId: string,
  row: Record<string, unknown>,
  fallback: UserAiConfig,
): UserAiConfig {
  const rawChatProvider = String(row.chat_provider || "");
  const chatProvider: ChatProviderId = VALID_CHAT_PROVIDERS.has(rawChatProvider as ChatProviderId)
    ? (rawChatProvider as ChatProviderId)
    : fallback.chatProvider;

  const rawEmbeddingProvider = String(row.embedding_provider || "");
  const embeddingProvider: EmbeddingProviderId = VALID_EMBEDDING_PROVIDERS.has(
    rawEmbeddingProvider as EmbeddingProviderId,
  )
    ? (rawEmbeddingProvider as EmbeddingProviderId)
    : fallback.embeddingProvider;

  const dbProviders =
    typeof row.providers === "object" && row.providers !== null
      ? (row.providers as ProvidersCredentialMap)
      : {};

  const mergedProviders: ProvidersCredentialMap = { ...fallback.providers };
  for (const key of ["ollama", "openrouter", "openai", "custom"] as ChatProviderId[]) {
    const dbCred = dbProviders[key];
    const fbCred = fallback.providers[key];
    mergedProviders[key] = {
      apiKey: dbCred?.apiKey?.trim() || fbCred?.apiKey,
      baseUrl: dbCred?.baseUrl?.trim() || fbCred?.baseUrl,
      preferredChatModels: Array.isArray(dbCred?.preferredChatModels)
        ? Array.from(
            new Set(
              dbCred.preferredChatModels
                .map((m) => sanitizeModelId(String(m)))
                .filter(Boolean),
            ),
          )
        : AI_PROVIDER_CATALOG[key].chatModelPresets,
      preferredEmbeddingModels: Array.isArray(dbCred?.preferredEmbeddingModels)
        ? Array.from(
            new Set(
              dbCred.preferredEmbeddingModels
                .map((m) => sanitizeModelId(String(m)))
                .filter(Boolean),
            ),
          )
        : AI_PROVIDER_CATALOG[key].embeddingModelPresets,
    };
  }

  const chatModel =
    sanitizeModelId(String(row.chat_model || "")) ||
    AI_PROVIDER_CATALOG[chatProvider].defaultChatModel;

  const embeddingModel =
    sanitizeModelId(String(row.embedding_model || "")) ||
    (embeddingProvider === "deterministic"
      ? AI_PROVIDER_CATALOG.openrouter.defaultEmbeddingModel
      : AI_PROVIDER_CATALOG[embeddingProvider].defaultEmbeddingModel);

  return {
    ownerId,
    chatProvider,
    chatModel,
    embeddingProvider,
    embeddingModel,
    providers: mergedProviders,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined,
  };
}

let aiTableEnsured = false;

async function ensureUserAiConfigsTable() {
  if (aiTableEnsured) return;
  const db = getDb();
  await db.query(
    `create table if not exists user_ai_configs (
       owner_id text primary key default '',
       chat_provider text not null default 'ollama' check (chat_provider in ('ollama', 'openrouter', 'openai', 'custom')),
       chat_model text not null default '',
       embedding_provider text not null default 'openrouter' check (embedding_provider in ('openrouter', 'ollama', 'openai', 'custom', 'deterministic')),
       embedding_model text not null default '',
       providers jsonb not null default '{}'::jsonb,
       updated_at timestamptz not null default now()
     )`,
  );
  aiTableEnsured = true;
}

export function resetAiTableEnsuredForTests() {
  aiTableEnsured = false;
}

/**
 * Saves or updates the user's AI provider configuration in Postgres.
 * Preserves existing stored API keys if an empty/masked value is not overwriting them.
 */
export async function saveUserAiConfig(
  ownerId: string,
  input: {
    chatProvider: ChatProviderId;
    chatModel: string;
    embeddingProvider: EmbeddingProviderId;
    embeddingModel: string;
    providers?: ProvidersCredentialMap;
  },
): Promise<UserAiConfig> {
  await ensureUserAiConfigsTable();
  const db = getDb();
  const existingRows = await db.query(
    `select providers from user_ai_configs where owner_id = $1`,
    [ownerId],
  );

  const existingProviders: ProvidersCredentialMap =
    existingRows.length > 0 &&
    typeof existingRows[0].providers === "object" &&
    existingRows[0].providers !== null
      ? (existingRows[0].providers as ProvidersCredentialMap)
      : {};

  const nextProviders: ProvidersCredentialMap = { ...existingProviders };
  if (input.providers) {
    for (const key of ["ollama", "openrouter", "openai", "custom"] as ChatProviderId[]) {
      const incoming = input.providers[key];
      if (!incoming) continue;
      const prev = existingProviders[key] ?? {};
      nextProviders[key] = {
        apiKey:
          incoming.apiKey !== undefined
            ? incoming.apiKey.trim() || undefined
            : prev.apiKey,
        baseUrl:
          incoming.baseUrl !== undefined
            ? incoming.baseUrl.trim() || undefined
            : prev.baseUrl,
        preferredChatModels:
          incoming.preferredChatModels !== undefined
            ? Array.from(
                new Set(
                  incoming.preferredChatModels
                    .map((m) => sanitizeModelId(m))
                    .filter(Boolean),
                ),
              )
            : prev.preferredChatModels,
        preferredEmbeddingModels:
          incoming.preferredEmbeddingModels !== undefined
            ? Array.from(
                new Set(
                  incoming.preferredEmbeddingModels
                    .map((m) => sanitizeModelId(m))
                    .filter(Boolean),
                ),
              )
            : prev.preferredEmbeddingModels,
      };
    }
  }

  await db.query(
    `insert into user_ai_configs (
       owner_id, chat_provider, chat_model, embedding_provider, embedding_model, providers, updated_at
     ) values ($1, $2, $3, $4, $5, $6::jsonb, now())
     on conflict (owner_id) do update set
       chat_provider = excluded.chat_provider,
       chat_model = excluded.chat_model,
       embedding_provider = excluded.embedding_provider,
       embedding_model = excluded.embedding_model,
       providers = excluded.providers,
       updated_at = now()`,
    [
      ownerId,
      input.chatProvider,
      sanitizeModelId(input.chatModel),
      input.embeddingProvider,
      sanitizeModelId(input.embeddingModel),
      JSON.stringify(nextProviders),
    ],
  );

  return getUserAiConfig(ownerId);
}

export interface ChatModelOverride {
  provider?: ChatProviderId;
  model?: string;
}

export interface EmbeddingModelOverride {
  provider?: EmbeddingProviderId;
  model?: string;
}

/**
 * Resolves the active Chat LanguageModel instance (Vercel AI SDK) for `ownerId`.
 * Supports Ollama, OpenRouter, OpenAI, and custom OpenAI-compatible endpoints,
 * with optional per-request provider/model override.
 */
export async function resolveChatLanguageModel(
  ownerId = "",
  override?: ChatModelOverride,
) {
  const config = await getUserAiConfig(ownerId);
  const providerId: ChatProviderId =
    override?.provider && VALID_CHAT_PROVIDERS.has(override.provider)
      ? override.provider
      : config.chatProvider;
  const catalog = AI_PROVIDER_CATALOG[providerId];
  const cred = config.providers[providerId] ?? {};

  const baseURL = normalizeProviderBaseUrl(providerId, cred.baseUrl);
  const modelId =
    sanitizeModelId(override?.model) ||
    (providerId === config.chatProvider ? sanitizeModelId(config.chatModel) : "") ||
    catalog.defaultChatModel;

  const customFetch: typeof fetch | undefined =
    providerId === "openrouter"
      ? async (input, init) => {
          let modifiedInit = init;
          let parsedBody: Record<string, unknown> | null = null;

          if (init?.body && typeof init.body === "string") {
            try {
              parsedBody = JSON.parse(init.body) as Record<string, unknown>;
              // Inject OpenRouter native fallback models array (max 3) for :free models
              // so 429 rate-limits or 503 "no upstreams available" automatically fail over to openrouter/free
              if (
                typeof parsedBody.model === "string" &&
                parsedBody.model.endsWith(":free") &&
                !parsedBody.models
              ) {
                const freeFallbacks = Array.from(
                  new Set([
                    parsedBody.model,
                    ...(cred.preferredChatModels ?? []).filter(
                      (m) => m.endsWith(":free") || m === "openrouter/free",
                    ),
                    "openrouter/free",
                  ]),
                ).slice(0, 3);

                if (freeFallbacks.length > 1) {
                  parsedBody = {
                    ...parsedBody,
                    models: freeFallbacks,
                  };
                  modifiedInit = {
                    ...init,
                    body: JSON.stringify(parsedBody),
                  };
                }
              }
            } catch {}
          }

          const res = await fetch(input, modifiedInit);

          // If OpenRouter upstream still returns 429/502/503 and Ollama is configured,
          // automatically fail over to Ollama so the chat request succeeds without 503/429 failure.
          if (
            (res.status === 429 || res.status === 502 || res.status === 503) &&
            parsedBody &&
            config.providers.ollama?.apiKey
          ) {
            const ollamaCred = config.providers.ollama;
            const ollamaBase = normalizeProviderBaseUrl(
              "ollama",
              ollamaCred.baseUrl,
            );
            const ollamaModel =
              ollamaCred.preferredChatModels?.[0] ||
              AI_PROVIDER_CATALOG.ollama.defaultChatModel;
            const fallbackBody: Record<string, unknown> = {
              ...parsedBody,
              model: ollamaModel,
            };
            delete fallbackBody.models;

            const ollamaHeaders = new Headers(init?.headers);
            ollamaHeaders.set("Authorization", `Bearer ${ollamaCred.apiKey}`);
            ollamaHeaders.delete("HTTP-Referer");
            ollamaHeaders.delete("X-Title");

            const ollamaRes = await fetch(`${ollamaBase}/chat/completions`, {
              ...init,
              headers: ollamaHeaders,
              body: JSON.stringify(fallbackBody),
            });
            if (ollamaRes.ok) {
              return ollamaRes;
            }
          }

          return res;
        }
      : undefined;

  const client = createOpenAICompatible({
    name: providerId,
    baseURL,
    apiKey: cred.apiKey,
    headers: catalog.headers,
    fetch: customFetch,
  });

  return {
    model: client(modelId),
    providerId,
    modelId,
    baseURL,
  };
}

/**
 * Resolves the active Embedder for `ownerId` (OpenRouter, Ollama, OpenAI, Custom, or Deterministic).
 * Supports optional per-operation provider/model override and safely falls back to the
 * deterministic fake embedder if no API key/baseURL is available.
 */
export async function resolveEmbedder(
  ownerId = "",
  override?: EmbeddingModelOverride,
): Promise<Embedder> {
  const config = await getUserAiConfig(ownerId);
  const effectiveConfig: UserAiConfig = {
    ...config,
    embeddingProvider:
      override?.provider && VALID_EMBEDDING_PROVIDERS.has(override.provider)
        ? override.provider
        : config.embeddingProvider,
    embeddingModel:
      override?.model?.trim() ||
      (override?.provider && override.provider !== config.embeddingProvider
        ? override.provider === "deterministic"
          ? ""
          : AI_PROVIDER_CATALOG[override.provider].defaultEmbeddingModel
        : config.embeddingModel),
  };
  return createEmbedderFromConfig(effectiveConfig);
}

export function createEmbedderFromConfig(config: UserAiConfig): Embedder {
  if (config.embeddingProvider === "deterministic") {
    return createDeterministicFakeEmbedder();
  }

  const providerId = config.embeddingProvider;
  const catalog = AI_PROVIDER_CATALOG[providerId];
  const cred = config.providers[providerId] ?? {};
  const baseUrl = normalizeProviderBaseUrl(providerId, cred.baseUrl);
  const apiKey = cred.apiKey?.trim() || "";

  // If a cloud provider is selected but has no API key configured and isn't a local endpoint,
  // safely fall back to deterministic fake embedder so local/offline work never crashes.
  const isLocalUrl =
    baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  if (!apiKey && !isLocalUrl) {
    return createDeterministicFakeEmbedder();
  }

  return createHttpEmbedder({
    baseUrl,
    apiKey,
    model: config.embeddingModel || catalog.defaultEmbeddingModel,
    headers: catalog.headers,
  });
}

export function maskSecret(secret?: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 5)}••••••${secret.slice(-4)}`;
}

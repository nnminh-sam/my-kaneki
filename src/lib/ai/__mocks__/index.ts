// Storybook-only mock of "@/lib/ai" (registered with sb.mock in .storybook/preview.tsx).
// The real module pulls in server code (DB, node:crypto) that cannot run in the browser.
// Client components only need the static provider catalog, mirrored here from src/lib/ai/providers.ts —
// keep the two in sync if the catalog changes.
import type { ChatProviderId, ProviderCatalogEntry } from "../providers";

export type {
  ChatProviderId,
  EmbeddingProviderId,
  ProviderCredentials,
  ProvidersCredentialMap,
  UserAiConfig,
  ProviderCatalogEntry,
  ChatModelOverride,
  EmbeddingModelOverride,
} from "../providers";

export const AI_PROVIDER_CATALOG: Record<ChatProviderId, ProviderCatalogEntry> = {
  ollama: {
    id: "ollama",
    label: "Ollama (Cloud / Local)",
    defaultBaseUrl: "https://ollama.com/v1",
    defaultChatModel: "gemma4:31b-cloud",
    defaultEmbeddingModel: "nomic-embed-text",
    chatModelPresets: ["gemma4:31b-cloud", "gpt-oss:120b", "qwen3:32b", "llama3.3:70b"],
    embeddingModelPresets: ["nomic-embed-text", "mxbai-embed-large", "bge-m3"],
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
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultChatModel: "gpt-4o-mini",
    defaultEmbeddingModel: "text-embedding-3-small",
    chatModelPresets: ["gpt-4o-mini", "gpt-4o", "o3-mini"],
    embeddingModelPresets: ["text-embedding-3-small", "text-embedding-3-large"],
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

export function maskSecret(value?: string): string {
  if (!value) return "";
  return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

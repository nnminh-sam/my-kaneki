"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  Cpu,
  KeyRound,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  generateMcpApiKeyAction,
  revokeMcpApiKeyAction,
  saveAiSettingsAction,
  type ClientAiSettingsView,
} from "@/actions/settings";
import {
  AI_PROVIDER_CATALOG,
  type ChatProviderId,
  type EmbeddingProviderId,
} from "@/lib/ai";
import type { McpApiKeyRecord } from "@/lib/auth";

export function SettingsView({
  initialMcpKeys,
  initialAiSettings,
}: {
  initialMcpKeys: McpApiKeyRecord[];
  initialAiSettings: ClientAiSettingsView;
}) {
  const [mcpKeys, setMcpKeys] = useState<McpApiKeyRecord[]>(initialMcpKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [chatProvider, setChatProvider] = useState<ChatProviderId>(
    initialAiSettings.chatProvider,
  );
  const [chatModel, setChatModel] = useState(initialAiSettings.chatModel);
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProviderId>(
    initialAiSettings.embeddingProvider,
  );
  const [embeddingModel, setEmbeddingModel] = useState(
    initialAiSettings.embeddingModel,
  );

  const [providerInputs, setProviderInputs] = useState<
    Record<
      ChatProviderId,
      {
        apiKey: string;
        baseUrl: string;
        maskedApiKey: string;
        hasApiKey: boolean;
        preferredChatModels: string[];
        preferredEmbeddingModels: string[];
        newChatModelDraft: string;
        newEmbeddingModelDraft: string;
      }
    >
  >({
    ollama: {
      apiKey: "",
      baseUrl: initialAiSettings.providers.ollama.baseUrl,
      maskedApiKey: initialAiSettings.providers.ollama.maskedApiKey,
      hasApiKey: initialAiSettings.providers.ollama.hasApiKey,
      preferredChatModels: initialAiSettings.providers.ollama.preferredChatModels,
      preferredEmbeddingModels:
        initialAiSettings.providers.ollama.preferredEmbeddingModels,
      newChatModelDraft: "",
      newEmbeddingModelDraft: "",
    },
    openrouter: {
      apiKey: "",
      baseUrl: initialAiSettings.providers.openrouter.baseUrl,
      maskedApiKey: initialAiSettings.providers.openrouter.maskedApiKey,
      hasApiKey: initialAiSettings.providers.openrouter.hasApiKey,
      preferredChatModels:
        initialAiSettings.providers.openrouter.preferredChatModels,
      preferredEmbeddingModels:
        initialAiSettings.providers.openrouter.preferredEmbeddingModels,
      newChatModelDraft: "",
      newEmbeddingModelDraft: "",
    },
    openai: {
      apiKey: "",
      baseUrl: initialAiSettings.providers.openai.baseUrl,
      maskedApiKey: initialAiSettings.providers.openai.maskedApiKey,
      hasApiKey: initialAiSettings.providers.openai.hasApiKey,
      preferredChatModels: initialAiSettings.providers.openai.preferredChatModels,
      preferredEmbeddingModels:
        initialAiSettings.providers.openai.preferredEmbeddingModels,
      newChatModelDraft: "",
      newEmbeddingModelDraft: "",
    },
    custom: {
      apiKey: "",
      baseUrl: initialAiSettings.providers.custom.baseUrl,
      maskedApiKey: initialAiSettings.providers.custom.maskedApiKey,
      hasApiKey: initialAiSettings.providers.custom.hasApiKey,
      preferredChatModels: initialAiSettings.providers.custom.preferredChatModels,
      preferredEmbeddingModels:
        initialAiSettings.providers.custom.preferredEmbeddingModels,
      newChatModelDraft: "",
      newEmbeddingModelDraft: "",
    },
  });

  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPendingKey, startKeyTransition] = useTransition();
  const [isPendingAi, startAiTransition] = useTransition();

  function handleChatProviderChange(next: ChatProviderId) {
    setChatProvider(next);
    const preferred = providerInputs[next].preferredChatModels;
    setChatModel(preferred[0] || AI_PROVIDER_CATALOG[next].defaultChatModel);
  }

  function handleEmbeddingProviderChange(next: EmbeddingProviderId) {
    setEmbeddingProvider(next);
    if (next !== "deterministic") {
      const preferred = providerInputs[next].preferredEmbeddingModels;
      setEmbeddingModel(
        preferred[0] || AI_PROVIDER_CATALOG[next].defaultEmbeddingModel,
      );
    }
  }

  function persistProviderInputs(
    nextInputs: typeof providerInputs,
    overrideActive?: {
      chatProvider?: ChatProviderId;
      chatModel?: string;
      embeddingProvider?: EmbeddingProviderId;
      embeddingModel?: string;
    },
    successText = "AI Provider & Models saved.",
  ) {
    setStatusMsg(null);
    startAiTransition(async () => {
      const providersPayload: Partial<
        Record<
          ChatProviderId,
          {
            apiKey?: string;
            baseUrl?: string;
            preferredChatModels?: string[];
            preferredEmbeddingModels?: string[];
          }
        >
      > = {};

      for (const id of [
        "openrouter",
        "ollama",
        "openai",
        "custom",
      ] as ChatProviderId[]) {
        const entry = nextInputs[id];
        const chatDraft = entry.newChatModelDraft.trim();
        const embDraft = entry.newEmbeddingModelDraft.trim();
        const finalChatModels = chatDraft
          ? Array.from(new Set([...entry.preferredChatModels, chatDraft]))
          : entry.preferredChatModels;
        const finalEmbeddingModels = embDraft
          ? Array.from(new Set([...entry.preferredEmbeddingModels, embDraft]))
          : entry.preferredEmbeddingModels;

        providersPayload[id] = {
          ...(entry.apiKey.trim() ? { apiKey: entry.apiKey.trim() } : {}),
          baseUrl: entry.baseUrl.trim(),
          preferredChatModels: finalChatModels,
          preferredEmbeddingModels: finalEmbeddingModels,
        };
      }

      const res = await saveAiSettingsAction({
        chatProvider: overrideActive?.chatProvider ?? chatProvider,
        chatModel: overrideActive?.chatModel ?? chatModel,
        embeddingProvider:
          overrideActive?.embeddingProvider ?? embeddingProvider,
        embeddingModel: overrideActive?.embeddingModel ?? embeddingModel,
        providers: providersPayload,
      });

      if (!res.ok || !res.aiSettings) {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to save AI provider configuration",
        });
        return;
      }

      const updated = res.aiSettings;
      setProviderInputs({
        ollama: {
          apiKey: "",
          baseUrl: updated.providers.ollama.baseUrl,
          maskedApiKey: updated.providers.ollama.maskedApiKey,
          hasApiKey: updated.providers.ollama.hasApiKey,
          preferredChatModels: updated.providers.ollama.preferredChatModels,
          preferredEmbeddingModels:
            updated.providers.ollama.preferredEmbeddingModels,
          newChatModelDraft: "",
          newEmbeddingModelDraft: "",
        },
        openrouter: {
          apiKey: "",
          baseUrl: updated.providers.openrouter.baseUrl,
          maskedApiKey: updated.providers.openrouter.maskedApiKey,
          hasApiKey: updated.providers.openrouter.hasApiKey,
          preferredChatModels: updated.providers.openrouter.preferredChatModels,
          preferredEmbeddingModels:
            updated.providers.openrouter.preferredEmbeddingModels,
          newChatModelDraft: "",
          newEmbeddingModelDraft: "",
        },
        openai: {
          apiKey: "",
          baseUrl: updated.providers.openai.baseUrl,
          maskedApiKey: updated.providers.openai.maskedApiKey,
          hasApiKey: updated.providers.openai.hasApiKey,
          preferredChatModels: updated.providers.openai.preferredChatModels,
          preferredEmbeddingModels:
            updated.providers.openai.preferredEmbeddingModels,
          newChatModelDraft: "",
          newEmbeddingModelDraft: "",
        },
        custom: {
          apiKey: "",
          baseUrl: updated.providers.custom.baseUrl,
          maskedApiKey: updated.providers.custom.maskedApiKey,
          hasApiKey: updated.providers.custom.hasApiKey,
          preferredChatModels: updated.providers.custom.preferredChatModels,
          preferredEmbeddingModels:
            updated.providers.custom.preferredEmbeddingModels,
          newChatModelDraft: "",
          newEmbeddingModelDraft: "",
        },
      });

      setStatusMsg({
        type: "success",
        text: successText,
      });
    });
  }

  function addPreferredModel(
    providerId: ChatProviderId,
    kind: "chat" | "embedding",
  ) {
    const current = providerInputs[providerId];
    const raw =
      kind === "chat"
        ? current.newChatModelDraft.trim()
        : current.newEmbeddingModelDraft.trim();
    if (!raw) return;

    const nextInputs = {
      ...providerInputs,
      [providerId]:
        kind === "chat"
          ? {
              ...current,
              preferredChatModels: Array.from(
                new Set([...current.preferredChatModels, raw]),
              ),
              newChatModelDraft: "",
            }
          : {
              ...current,
              preferredEmbeddingModels: Array.from(
                new Set([...current.preferredEmbeddingModels, raw]),
              ),
              newEmbeddingModelDraft: "",
            },
    };

    setProviderInputs(nextInputs);
    persistProviderInputs(
      nextInputs,
      undefined,
      `Added "${raw}" to ${AI_PROVIDER_CATALOG[providerId].label} preferred ${kind} models.`,
    );
  }

  function removePreferredModel(
    providerId: ChatProviderId,
    kind: "chat" | "embedding",
    modelToRemove: string,
  ) {
    const current = providerInputs[providerId];
    const nextInputs = {
      ...providerInputs,
      [providerId]:
        kind === "chat"
          ? {
              ...current,
              preferredChatModels: current.preferredChatModels.filter(
                (m) => m !== modelToRemove,
              ),
            }
          : {
              ...current,
              preferredEmbeddingModels: current.preferredEmbeddingModels.filter(
                (m) => m !== modelToRemove,
              ),
            },
    };

    setProviderInputs(nextInputs);
    persistProviderInputs(
      nextInputs,
      undefined,
      `Removed "${modelToRemove}" from ${AI_PROVIDER_CATALOG[providerId].label}.`,
    );
  }

  function handleGenerateMcpKey(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    startKeyTransition(async () => {
      const res = await generateMcpApiKeyAction(newKeyName || "Cursor / Claude MCP");
      if (!res.ok || !res.key) {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to generate MCP API key",
        });
        return;
      }
      setNewlyCreatedSecret(res.key.rawKey);
      setNewKeyName("");
      setMcpKeys((prev) => [res.key!, ...prev]);
    });
  }

  function handleRevokeMcpKey(keyId: string) {
    setStatusMsg(null);
    startKeyTransition(async () => {
      const res = await revokeMcpApiKeyAction(keyId);
      if (!res.ok) {
        setStatusMsg({
          type: "error",
          text: res.error || "Failed to revoke API key",
        });
        return;
      }
      setMcpKeys((prev) =>
        prev.map((k) =>
          k.id === keyId ? { ...k, revokedAt: new Date().toISOString() } : k,
        ),
      );
      setStatusMsg({
        type: "success",
        text: "MCP API key revoked.",
      });
    });
  }

  function handleSaveAiConfig(e: React.FormEvent) {
    e.preventDefault();
    persistProviderInputs(
      providerInputs,
      undefined,
      "AI Provider & Embedding configuration saved to database.",
    );
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {}
  }

  const chatPresets = providerInputs[chatProvider].preferredChatModels;
  const embeddingPresets =
    embeddingProvider === "deterministic"
      ? []
      : providerInputs[embeddingProvider].preferredEmbeddingModels;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">
          API Keys & AI Providers
        </h1>
        <p className="mt-1 text-sm text-muted">
          Register personal MCP API keys for external agents and configure AI providers (OpenRouter, Ollama, OpenAI) directly in the database without storing secrets in{" "}
          <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs">.env</code>.
        </p>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            statusMsg.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Section 1: Inbound MCP API Keys (/api/mcp) */}
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-fg">
              Inbound MCP Server API Keys (<code className="text-sm">/api/mcp</code>)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Generate personal Bearer tokens for Cursor, Claude Desktop, or autonomous workers. Only the SHA-256 hash is stored in PostgreSQL, automatically linked to your account.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerateMcpKey} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key label (e.g. Cursor Desktop, Claude Desktop)"
            className="flex-1 rounded-xl border border-border bg-bg px-3.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPendingKey}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isPendingKey ? "Generating…" : "Generate API Key"}</span>
          </button>
        </form>

        {newlyCreatedSecret && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4" />
              <span>Copy your new MCP API key now — it will not be shown again!</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-fg">
                {newlyCreatedSecret}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(newlyCreatedSecret)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-fg hover:bg-surface-subtle cursor-pointer"
              >
                {copiedSecret ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 divide-y divide-border rounded-xl border border-border">
          {mcpKeys.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted">
              No MCP API keys registered yet. Generate one above to connect Cursor or Claude Desktop.
            </div>
          ) : (
            mcpKeys.map((key) => {
              const isRevoked = Boolean(key.revokedAt);
              return (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-fg">{key.name}</span>
                      <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs text-muted">
                        {key.keyPrefix}
                      </code>
                      {isRevoked ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                          Revoked
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                      {key.lastUsedAt
                        ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                        : " · Never used"}
                    </p>
                  </div>
                  {!isRevoked && (
                    <button
                      type="button"
                      disabled={isPendingKey}
                      onClick={() => handleRevokeMcpKey(key.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-danger-soft hover:text-danger cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Section 2: Unified AI Provider & Embedding Configuration */}
      <form
        onSubmit={handleSaveAiConfig}
        className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-fg">
              AI Provider Module (Chat LLM & LMS Vector Embeddings)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Mix and match providers like <strong>Ollama</strong> for Chat and <strong>OpenRouter</strong> for 1536-dim Vector Embeddings, or run both through OpenRouter.
            </p>
          </div>
        </div>

        {/* Active Model Routing */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Chat LLM Routing */}
          <div className="rounded-xl border border-border bg-bg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Workspace & Tutor Chat LLM</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Chat Provider
              </label>
              <select
                value={chatProvider}
                onChange={(e) =>
                  handleChatProviderChange(e.target.value as ChatProviderId)
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="ollama">Ollama (Cloud / Local)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="custom">Custom OpenAI-Compatible</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Chat Model ID
              </label>
              <input
                type="text"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                placeholder={AI_PROVIDER_CATALOG[chatProvider].defaultChatModel}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              />
              {chatPresets.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chatPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setChatModel(preset)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                        chatModel === preset
                          ? "border-accent bg-accent-soft text-accent font-medium"
                          : "border-border bg-surface text-muted hover:text-fg"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* LMS Vector Embedding Routing */}
          <div className="rounded-xl border border-border bg-bg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Cpu className="h-4 w-4 text-accent" />
              <span>LMS Vector Embeddings (1536-dim RAG)</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Embedding Provider
              </label>
              <select
                value={embeddingProvider}
                onChange={(e) =>
                  handleEmbeddingProviderChange(
                    e.target.value as EmbeddingProviderId,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="openrouter">OpenRouter (Recommended)</option>
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="custom">Custom OpenAI-Compatible</option>
                <option value="deterministic">
                  Offline Deterministic (No External API)
                </option>
              </select>
            </div>

            {embeddingProvider !== "deterministic" && (
              <div>
                <label className="block text-xs font-medium text-muted">
                  Embedding Model ID
                </label>
                <input
                  type="text"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder={
                    AI_PROVIDER_CATALOG[embeddingProvider].defaultEmbeddingModel
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                />
                {embeddingPresets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {embeddingPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEmbeddingModel(preset)}
                        className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                          embeddingModel === preset
                            ? "border-accent bg-accent-soft text-accent font-medium"
                            : "border-border bg-surface text-muted hover:text-fg"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Preferred AI Models per Provider */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              Preferred AI Models per Provider
            </h3>
            <p className="text-xs text-muted">
              Add or remove your preferred Chat and Embedding model IDs for each provider. These models appear in the quick Model Switcher across Chat and LMS.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(["ollama", "openrouter", "openai", "custom"] as ChatProviderId[]).map(
              (providerId) => {
                const catalog = AI_PROVIDER_CATALOG[providerId];
                const state = providerInputs[providerId];
                return (
                  <div
                    key={`models-${providerId}`}
                    className="rounded-xl border border-border bg-bg p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-sm font-semibold text-fg">
                        {catalog.label}
                      </span>
                      <span className="text-[11px] text-muted">
                        {state.preferredChatModels.length} chat ·{" "}
                        {state.preferredEmbeddingModels.length} embedding
                      </span>
                    </div>

                    {/* Preferred Chat Models */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-muted">
                        Preferred Chat Models
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {state.preferredChatModels.length === 0 ? (
                          <span className="text-[11px] text-muted italic">
                            No preferred chat models added
                          </span>
                        ) : (
                          state.preferredChatModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-fg"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setChatProvider(providerId);
                                  setChatModel(m);
                                  persistProviderInputs(
                                    providerInputs,
                                    { chatProvider: providerId, chatModel: m },
                                    `Active Chat model set to ${AI_PROVIDER_CATALOG[providerId].label} / ${m}.`,
                                  );
                                }}
                                title="Set as active Chat model"
                                className="hover:text-accent cursor-pointer"
                              >
                                {m}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removePreferredModel(providerId, "chat", m)
                                }
                                title="Remove model"
                                className="text-muted hover:text-danger cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={state.newChatModelDraft}
                          onChange={(e) =>
                            setProviderInputs((prev) => ({
                              ...prev,
                              [providerId]: {
                                ...prev[providerId],
                                newChatModelDraft: e.target.value,
                              },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPreferredModel(providerId, "chat");
                            }
                          }}
                          placeholder={`Add chat model (e.g. ${catalog.defaultChatModel})`}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addPreferredModel(providerId, "chat")}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-subtle cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>

                    {/* Preferred Embedding Models */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-muted">
                        Preferred Embedding Models
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {state.preferredEmbeddingModels.length === 0 ? (
                          <span className="text-[11px] text-muted italic">
                            No preferred embedding models added
                          </span>
                        ) : (
                          state.preferredEmbeddingModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-fg"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEmbeddingProvider(providerId);
                                  setEmbeddingModel(m);
                                  persistProviderInputs(
                                    providerInputs,
                                    {
                                      embeddingProvider: providerId,
                                      embeddingModel: m,
                                    },
                                    `Active Embedding model set to ${AI_PROVIDER_CATALOG[providerId].label} / ${m}.`,
                                  );
                                }}
                                title="Set as active Embedding model"
                                className="hover:text-accent cursor-pointer"
                              >
                                {m}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removePreferredModel(
                                    providerId,
                                    "embedding",
                                    m,
                                  )
                                }
                                title="Remove model"
                                className="text-muted hover:text-danger cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={state.newEmbeddingModelDraft}
                          onChange={(e) =>
                            setProviderInputs((prev) => ({
                              ...prev,
                              [providerId]: {
                                ...prev[providerId],
                                newEmbeddingModelDraft: e.target.value,
                              },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPreferredModel(providerId, "embedding");
                            }
                          }}
                          placeholder={`Add embedding model (e.g. ${catalog.defaultEmbeddingModel})`}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            addPreferredModel(providerId, "embedding")
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-subtle cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        {/* Provider Credentials (OpenRouter, Ollama, OpenAI, Custom) */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-fg">
            Provider API Keys & Endpoints
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {(["openrouter", "ollama", "openai", "custom"] as ChatProviderId[]).map(
              (providerId) => {
                const catalog = AI_PROVIDER_CATALOG[providerId];
                const state = providerInputs[providerId];
                return (
                  <div
                    key={providerId}
                    className="rounded-xl border border-border bg-bg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-fg">
                        {catalog.label}
                      </span>
                      {state.hasApiKey ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Key configured ({state.maskedApiKey})
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">Not set</span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-muted">
                        API Key {state.hasApiKey ? "(leave blank to keep existing)" : ""}
                      </label>
                      <input
                        type="password"
                        value={state.apiKey}
                        onChange={(e) =>
                          setProviderInputs((prev) => ({
                            ...prev,
                            [providerId]: {
                              ...prev[providerId],
                              apiKey: e.target.value,
                            },
                          }))
                        }
                        placeholder={
                          state.hasApiKey
                            ? state.maskedApiKey
                            : `Enter ${catalog.label} API Key`
                        }
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted">
                        Base URL (optional)
                      </label>
                      <input
                        type="text"
                        value={state.baseUrl}
                        onChange={(e) =>
                          setProviderInputs((prev) => ({
                            ...prev,
                            [providerId]: {
                              ...prev[providerId],
                              baseUrl: e.target.value,
                            },
                          }))
                        }
                        placeholder={catalog.defaultBaseUrl}
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPendingAi}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{isPendingAi ? "Saving…" : "Save AI Provider Settings"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

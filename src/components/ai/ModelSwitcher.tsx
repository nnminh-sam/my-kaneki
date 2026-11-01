"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Cpu, Settings2, Sparkles } from "lucide-react";
import {
  AI_PROVIDER_CATALOG,
  type ChatProviderId,
  type EmbeddingProviderId,
} from "@/lib/ai";

interface ModelSwitcherProps {
  mode: "chat" | "embedding";
  onChange?: (selection: { provider: string; model: string }) => void;
  compact?: boolean;
  direction?: "up" | "down";
  align?: "left" | "right" | "auto";
}

const PROVIDER_SHORT_LABELS: Record<string, string> = {
  ollama: "Ollama",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  custom: "Custom",
  deterministic: "Offline Hash",
};

export function ModelSwitcher({
  mode,
  onChange,
  compact = false,
  direction = "up",
  align = "auto",
}: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [resolvedAlign, setResolvedAlign] = useState<"left" | "right">(
    align === "left" ? "left" : "right",
  );
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [provider, setProvider] = useState<string>(
    mode === "chat" ? "ollama" : "openrouter",
  );
  const [model, setModel] = useState<string>(
    mode === "chat"
      ? AI_PROVIDER_CATALOG.ollama.defaultChatModel
      : AI_PROVIDER_CATALOG.openrouter.defaultEmbeddingModel,
  );
  const [customModelInput, setCustomModelInput] = useState("");
  const [configuredProviders, setConfiguredProviders] = useState<
    Record<string, boolean>
  >({});
  const [preferredModels, setPreferredModels] = useState<
    Record<string, { chatModels: string[]; embeddingModels: string[] }>
  >({});
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDropdownPosition = () => {
    if (!containerRef.current) return;
    if (align === "left" || align === "right") {
      setResolvedAlign(align);
      setDropdownStyle({});
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const dropdownWidth = 304; // w-76 = 19rem = 304px

    // Determine the clipping boundaries by inspecting ancestors
    let leftBoundary = 8;
    let rightBoundary = window.innerWidth - 8;

    let parent = containerRef.current.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      const ox = style.overflowX;
      const o = style.overflow;
      if (
        o === "hidden" ||
        o === "auto" ||
        o === "scroll" ||
        ox === "hidden" ||
        ox === "auto" ||
        ox === "scroll"
      ) {
        const pRect = parent.getBoundingClientRect();
        leftBoundary = Math.max(leftBoundary, pRect.left + 8);
        rightBoundary = Math.min(rightBoundary, pRect.right - 8);
        break;
      }
      parent = parent.parentElement;
    }

    const wouldOverflowLeftWithRightAlign =
      rect.right - dropdownWidth < leftBoundary;
    const wouldOverflowRightWithLeftAlign =
      rect.left + dropdownWidth > rightBoundary;

    if (wouldOverflowLeftWithRightAlign && !wouldOverflowRightWithLeftAlign) {
      setResolvedAlign("left");
      setDropdownStyle({});
    } else if (!wouldOverflowLeftWithRightAlign) {
      setResolvedAlign("right");
      setDropdownStyle({});
    } else {
      // Narrow container: pin to left and clamp maxWidth to available space
      setResolvedAlign("left");
      const availableWidth = Math.max(220, rightBoundary - leftBoundary);
      setDropdownStyle({
        maxWidth: `${availableWidth}px`,
      });
    }
  };

  async function loadConfig(syncActive = false) {
    try {
      const res = await fetch("/api/ai/config", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConfiguredProviders(data.configuredProviders ?? {});
      setPreferredModels(data.preferredModels ?? {});
      if (syncActive) {
        const p = mode === "chat" ? data.chatProvider : data.embeddingProvider;
        const m = mode === "chat" ? data.chatModel : data.embeddingModel;
        setProvider(p);
        setModel(m);
        setCustomModelInput(m);
        onChange?.({ provider: p, model: m });
      }
    } catch {}
  }

  useEffect(() => {
    void loadConfig(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (open) {
      void loadConfig(false);
      updateDropdownPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function handleResize() {
      updateDropdownPosition();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function applySelection(nextProvider: string, nextModel: string) {
    setProvider(nextProvider);
    setModel(nextModel);
    setCustomModelInput(nextModel);
    onChange?.({ provider: nextProvider, model: nextModel });
    setSaving(true);
    try {
      await fetch("/api/ai/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "chat"
            ? { chatProvider: nextProvider, chatModel: nextModel }
            : { embeddingProvider: nextProvider, embeddingModel: nextModel },
        ),
      });
    } catch {
      // Ignore network errors; per-request override still works
    } finally {
      setSaving(false);
    }
  }

  const providerOptions: Array<{ id: string; label: string }> =
    mode === "chat"
      ? [
          { id: "ollama", label: "Ollama" },
          { id: "openrouter", label: "OpenRouter" },
          { id: "openai", label: "OpenAI" },
          { id: "custom", label: "Custom" },
        ]
      : [
          { id: "openrouter", label: "OpenRouter" },
          { id: "ollama", label: "Ollama" },
          { id: "openai", label: "OpenAI" },
          { id: "custom", label: "Custom" },
          { id: "deterministic", label: "Offline Hash" },
        ];

  const activeCatalog =
    provider !== "deterministic"
      ? AI_PROVIDER_CATALOG[provider as ChatProviderId]
      : null;

  const presets = activeCatalog
    ? mode === "chat"
      ? (preferredModels[provider]?.chatModels ??
          activeCatalog.chatModelPresets)
      : (preferredModels[provider]?.embeddingModels ??
          activeCatalog.embeddingModelPresets)
    : [];

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            updateDropdownPosition();
          }
          setOpen((prev) => !prev);
        }}
        title={`Switch ${mode === "chat" ? "Chat LLM" : "Embedding"} Provider & Model`}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle/80 text-fg transition-colors hover:border-accent/40 hover:bg-surface cursor-pointer ${
          compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
        }`}
      >
        {mode === "chat" ? (
          <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
        ) : (
          <Cpu className="h-3.5 w-3.5 text-accent shrink-0" />
        )}
        <span className="font-medium text-accent">
          {PROVIDER_SHORT_LABELS[provider] || provider}
        </span>
        {provider !== "deterministic" && model && (
          <>
            <span className="text-muted">/</span>
            <span className="max-w-[140px] truncate font-mono text-[11px]">
              {model}
            </span>
          </>
        )}
        <ChevronDown className="h-3 w-3 text-muted shrink-0" />
      </button>

      {open && (
        <div
          style={dropdownStyle}
          className={`absolute z-50 w-76 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-3 shadow-lg ${
            resolvedAlign === "left" ? "left-0" : "right-0"
          } ${
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold text-fg">
              {mode === "chat"
                ? "Switch Chat AI Model"
                : "Switch Embedding Model"}
            </span>
            <Link
              href="/ai-provider"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <Settings2 className="h-3 w-3" />
              <span>Configure Keys</span>
            </Link>
          </div>

          {/* Provider Tabs */}
          <div className="mt-2.5">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
              Provider
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              {providerOptions.map((opt) => {
                const isSelected = provider === opt.id;
                const hasKey =
                  opt.id === "deterministic" || configuredProviders[opt.id];
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const userPreferred =
                        mode === "chat"
                          ? preferredModels[opt.id]?.chatModels?.[0]
                          : preferredModels[opt.id]?.embeddingModels?.[0];
                      const nextDefaultModel =
                        opt.id === "deterministic"
                          ? ""
                          : userPreferred ||
                            (mode === "chat"
                              ? AI_PROVIDER_CATALOG[opt.id as ChatProviderId]
                                  .defaultChatModel
                              : AI_PROVIDER_CATALOG[
                                  opt.id as Exclude<
                                    EmbeddingProviderId,
                                    "deterministic"
                                  >
                                ].defaultEmbeddingModel);
                      void applySelection(opt.id, nextDefaultModel);
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent-soft text-accent font-semibold"
                        : "border-border bg-bg text-muted hover:text-fg"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        hasKey ? "bg-ok" : "bg-muted/40"
                      }`}
                      title={
                        hasKey
                          ? "Configured"
                          : "No API key configured yet (set in AI Provider tab)"
                      }
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset Models & Custom Model Input */}
          {provider !== "deterministic" && (
            <div className="mt-3 space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Model
              </label>

              {presets.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {presets.map((preset) => {
                    const active = model === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          void applySelection(provider, preset);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors cursor-pointer ${
                          active
                            ? "bg-accent-soft text-accent font-medium"
                            : "text-fg hover:bg-surface-subtle"
                        }`}
                      >
                        <span className="truncate">{preset}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customModelInput.trim()) {
                    void applySelection(provider, customModelInput.trim());
                    setOpen(false);
                  }
                }}
                className="flex gap-1.5 pt-1"
              >
                <input
                  type="text"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="Custom model ID (e.g. openai/gpt-4o)"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
                >
                  Use
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

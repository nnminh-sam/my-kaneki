"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { ModelSwitcher } from "@/components/ai/ModelSwitcher";

interface AgentChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  placeholder?: string;
  headerBadge?: string;
  onModelChange: (model: { provider: string; model: string } | null) => void;
}

export function AgentChatInput({
  onSend,
  onStop,
  isGenerating,
  placeholder = "Ask a question, update notes, or manage tasks...",
  headerBadge,
  onModelChange,
}: AgentChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-surface p-4">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end rounded-xl border border-border bg-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-muted focus:outline-hidden leading-relaxed"
          />

          <div className="ml-2 flex items-center gap-1">
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop generating"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                title="Send message (Enter)"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-muted">
          <span className="truncate">Press Enter to send, Shift+Enter for new line</span>
          <div className="flex items-center gap-2 shrink-0">
            <ModelSwitcher
              mode="chat"
              compact
              direction="up"
              onChange={onModelChange}
            />
            {!headerBadge && (
              <span className="hidden sm:inline">
                Actions logged to audit_log
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

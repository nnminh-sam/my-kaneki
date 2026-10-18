"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2, X } from "lucide-react";

export type ModalType = "prompt" | "confirm" | "alert";

interface ModalProps {
  isOpen: boolean;
  type?: ModalType;
  title: string;
  description?: string;
  defaultValue?: string;
  inputPlaceholder?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export function ActionModal({
  isOpen,
  type = "prompt",
  title,
  description,
  defaultValue = "",
  inputPlaceholder = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(defaultValue);
    if (isOpen && type === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultValue, type]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "prompt") {
      onConfirm(value.trim());
    } else {
      onConfirm();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute right-3.5 top-3.5 rounded p-1 text-muted hover:text-fg disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          {isDestructive ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <AlertTriangle className="h-5 w-5" />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Info className="h-5 w-5" />
            </div>
          )}

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4">
          {type === "prompt" && (
            <div className="mb-4">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={isLoading}
                required
                className="w-full rounded-md border border-border bg-surface-subtle px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {type !== "alert" && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-50"
              >
                {cancelText}
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || (type === "prompt" && !value.trim())}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50 ${
                isDestructive
                  ? "bg-danger hover:opacity-90"
                  : "bg-accent hover:opacity-90"
              }`}
            >
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

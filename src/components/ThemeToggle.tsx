"use client";

import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/app/actions";
import type { Theme } from "@/lib/theme";

export function ThemeToggle({
  initial,
  collapsed = false,
  variant = "auto",
}: {
  initial: Theme;
  collapsed?: boolean;
  variant?: "auto" | "icon" | "segmented";
}) {
  const [theme, setThemeState] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  function applyTheme(next: Theme) {
    const previous = theme;
    setThemeState(next);
    document.documentElement.dataset.theme = next;

    startTransition(async () => {
      try {
        await setThemeAction(next);
      } catch {
        setThemeState(previous);
        document.documentElement.dataset.theme = previous;
      }
    });
  }

  function cycleTheme() {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    applyTheme(next);
  }

  const isIconOnly = variant === "icon" || (variant === "auto" && collapsed);

  if (isIconOnly) {
    return (
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={`Current theme: ${theme}. Click to switch theme.`}
        title={`Theme: ${theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"} (Click to cycle)`}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-subtle text-fg transition-all hover:border-accent hover:bg-surface"
      >
        {theme === "light" ? (
          <Sun className="h-4 w-4 text-amber-500" />
        ) : theme === "dark" ? (
          <Moon className="h-4 w-4 text-accent" />
        ) : (
          <Monitor className="h-4 w-4 text-muted" />
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className="flex w-full items-center rounded-lg border border-border bg-surface-subtle p-0.5 text-xs"
    >
      <button
        type="button"
        onClick={() => applyTheme("light")}
        aria-pressed={theme === "light"}
        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 px-2 font-medium transition-all ${
          theme === "light"
            ? "bg-surface font-semibold text-fg shadow-xs"
            : "text-muted hover:text-fg"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        <span>Light</span>
      </button>

      <button
        type="button"
        onClick={() => applyTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 px-2 font-medium transition-all ${
          theme === "dark"
            ? "bg-surface font-semibold text-fg shadow-xs"
            : "text-muted hover:text-fg"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span>Dark</span>
      </button>

      <button
        type="button"
        onClick={() => applyTheme("system")}
        aria-pressed={theme === "system"}
        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 px-2 font-medium transition-all ${
          theme === "system"
            ? "bg-surface font-semibold text-fg shadow-xs"
            : "text-muted hover:text-fg"
        }`}
      >
        <Monitor className="h-3.5 w-3.5" />
        <span>Auto</span>
      </button>
    </div>
  );
}

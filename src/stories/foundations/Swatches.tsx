"use client";

import { useEffect, useState } from "react";

/** Reads a CSS custom property from <html> and re-reads it when data-theme changes. */
function useCssVar(name: string): string {
  const [value, setValue] = useState("");
  useEffect(() => {
    const read = () => setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [name]);
  return value;
}

export interface Token {
  /** CSS variable defined in src/app/globals.css, e.g. "--accent". */
  cssVar: string;
  /** Tailwind utility suffix exposed by @theme inline, e.g. "accent" → bg-accent / text-accent. */
  utility: string;
  usage: string;
}

function Swatch({ token }: { token: Token }) {
  const value = useCssVar(token.cssVar);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
      <div
        className="h-10 w-10 shrink-0 rounded-md border border-border"
        style={{ background: `var(${token.cssVar})` }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <code className="font-mono text-xs font-semibold text-fg">{token.utility}</code>
          <code className="font-mono text-[11px] text-muted">{token.cssVar}</code>
          <code className="font-mono text-[11px] text-muted">{value}</code>
        </div>
        <p className="mt-0.5 text-xs text-muted">{token.usage}</p>
      </div>
    </div>
  );
}

export function SwatchGrid({ tokens }: { tokens: Token[] }) {
  return (
    <div className="sb-unstyled my-4 grid gap-2 sm:grid-cols-2">
      {tokens.map((t) => (
        <Swatch key={t.cssVar} token={t} />
      ))}
    </div>
  );
}

/** Renders a sample with the given className and shows the className below it. */
export function Recipe({ name, className, children }: { name: string; className: string; children: React.ReactNode }) {
  return (
    <div className="sb-unstyled my-3 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-xs font-semibold text-fg">{name}</div>
      <div className="mb-3">{children}</div>
      <code className="block whitespace-pre-wrap break-all rounded-md bg-surface-subtle px-2 py-1.5 font-mono text-[11px] text-muted">
        {className}
      </code>
    </div>
  );
}

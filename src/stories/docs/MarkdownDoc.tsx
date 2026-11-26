"use client";

import { Markdown } from "@storybook/addon-docs/blocks";
import { useEffect, useId, useState } from "react";

/**
 * Mermaid colors taken from the app's tokens (src/app/globals.css) for the current data-theme, so every label —
 * sequence messages, ER relationships, flowchart edges — uses --fg / --muted on --surface and stays readable.
 * Mermaid derives shades from these, so they must be concrete hex values (read from computed style), not var().
 */
function tokenThemeVariables(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const fg = v("--fg");
  const muted = v("--muted");
  const surface = v("--surface");
  const subtle = v("--surface-subtle");
  const border = v("--border");
  const accent = v("--accent");
  const accentSoft = v("--accent-soft");
  return {
    background: surface,
    fontSize: "13px",
    // nodes / actors / entities
    primaryColor: subtle,
    primaryTextColor: fg,
    primaryBorderColor: border,
    secondaryColor: accentSoft,
    secondaryTextColor: fg,
    secondaryBorderColor: accent,
    tertiaryColor: surface,
    tertiaryTextColor: fg,
    tertiaryBorderColor: border,
    mainBkg: subtle,
    nodeBorder: border,
    nodeTextColor: fg,
    textColor: fg,
    titleColor: fg,
    // lines and their labels
    lineColor: muted,
    edgeLabelBackground: surface,
    clusterBkg: surface,
    clusterBorder: border,
    // sequence diagrams
    actorBkg: subtle,
    actorBorder: border,
    actorTextColor: fg,
    actorLineColor: muted,
    signalColor: fg,
    signalTextColor: fg,
    labelBoxBkgColor: subtle,
    labelBoxBorderColor: border,
    labelTextColor: fg,
    loopTextColor: fg,
    activationBkgColor: accentSoft,
    activationBorderColor: accent,
    sequenceNumberColor: surface,
    noteBkgColor: accentSoft,
    noteTextColor: fg,
    noteBorderColor: accent,
    // ER diagrams
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: subtle,
    relationColor: muted,
    relationLabelColor: fg,
    relationLabelBackground: surface,
    // state diagrams
    labelColor: fg,
    altBackground: surface,
    stateLabelColor: fg,
    transitionColor: muted,
    transitionLabelColor: fg,
    specialStateColor: accent,
  };
}

/** Renders a ```mermaid fence as a diagram, re-rendering when the Storybook theme (data-theme) changes. */
function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [theme, setTheme] = useState<string>("light");

  useEffect(() => {
    const read = () => {
      const t = document.documentElement.getAttribute("data-theme");
      const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      setTheme(dark ? "dark" : "light");
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          darkMode: theme === "dark",
          fontFamily: '"Geist", system-ui, sans-serif',
          themeVariables: tokenThemeVariables(),
        });
        const { svg } = await mermaid.render(`m${id}${theme}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id, theme]);

  if (error) {
    return (
      <pre className="overflow-auto rounded-lg bg-danger-soft p-3 text-xs text-danger">
        Mermaid error: {error}
        {"\n\n"}
        {code}
      </pre>
    );
  }
  return (
    <div
      className="sb-unstyled my-4 overflow-x-auto rounded-xl border border-border bg-surface p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Code override for markdown-to-jsx: mermaid fences become diagrams, everything else stays a code block. */
function Code({ className, children, ...rest }: { className?: string; children?: React.ReactNode }) {
  if (className?.includes("lang-mermaid")) {
    return <MermaidDiagram code={String(children ?? "").trim()} />;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function Pre({ children }: { children?: React.ReactNode }) {
  // Unwrap <pre> around a mermaid diagram so it isn't rendered inside a code box.
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === "object" && "props" in child) {
    const props = (child as { props: { className?: string } }).props;
    if (props.className?.includes("lang-mermaid")) return <>{children}</>;
  }
  return <pre>{children}</pre>;
}

/**
 * Renders a repository markdown file (imported with `?raw`) inside a Storybook docs page, so docs/system/*.md
 * stay the single source of truth and read the same on GitHub and in Storybook.
 */
export function MarkdownDoc({ source }: { source: string }) {
  return <Markdown options={{ overrides: { code: { component: Code }, pre: { component: Pre } } }}>{source}</Markdown>;
}

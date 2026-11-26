import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { DocsContainer, type DocsContainerProps } from "@storybook/addon-docs/blocks";
import { useEffect, useState, type PropsWithChildren } from "react";
import { addons } from "storybook/preview-api";
import { create } from "storybook/theming";
import { sb } from "storybook/test";
import "katex/dist/katex.min.css";
import "../src/app/globals.css";

// Server-only modules imported by client components. Replaced by the files in their __mocks__ folders,
// so stories never bundle DB / node:crypto code.
sb.mock(import("../src/lib/ai/index.ts"));
sb.mock(import("../src/actions/lms.ts"));

type ThemeSetting = "light" | "dark" | "system";

/** Mirrors the app: src/app/layout.tsx puts the saved setting on <html data-theme>, globals.css swaps tokens from it. */
function applyTheme(theme: ThemeSetting) {
  document.documentElement.setAttribute("data-theme", theme);
}

function isDark(theme: ThemeSetting): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/** Storybook's own docs chrome (page background, prose, tables, code) matched to the app's --bg / --fg / --border tokens. */
const docsThemes = {
  light: create({
    base: "light",
    appContentBg: "#f7f7f5",
    appBg: "#f1f0ec",
    appBorderColor: "#e6e4df",
    textColor: "#1c1b19",
    textMutedColor: "#74716b",
    colorSecondary: "#3f51d8",
    fontBase: '"Geist", system-ui, sans-serif',
    fontCode: '"Geist Mono", ui-monospace, monospace',
  }),
  dark: create({
    base: "dark",
    appContentBg: "#111110",
    appBg: "#191918",
    appBorderColor: "#2c2b28",
    textColor: "#ecebe7",
    textMutedColor: "#9b988f",
    colorSecondary: "#8d9bff",
    fontBase: '"Geist", system-ui, sans-serif',
    fontCode: '"Geist Mono", ui-monospace, monospace',
  }),
};

/** Tracks the toolbar "theme" global live (docs pages are not re-rendered by decorators, so listen on the channel). */
function useThemeGlobal(initial: ThemeSetting): ThemeSetting {
  const [theme, setTheme] = useState<ThemeSetting>(initial);
  useEffect(() => {
    const channel = addons.getChannel();
    const onGlobals = ({ globals }: { globals: Record<string, unknown> }) => {
      if (globals?.theme) setTheme(globals.theme as ThemeSetting);
    };
    channel.on("globalsUpdated", onGlobals);
    channel.on("setGlobals", onGlobals);
    return () => {
      channel.off("globalsUpdated", onGlobals);
      channel.off("setGlobals", onGlobals);
    };
  }, []);
  return theme;
}

/** Docs pages (MDX + autodocs): apply data-theme for the app tokens and switch Storybook's docs theme with it. */
function ThemedDocsContainer({ context, children }: PropsWithChildren<DocsContainerProps>) {
  const store = (context as unknown as { store?: { userGlobals?: { globals?: Record<string, unknown> } } }).store;
  const initial = (store?.userGlobals?.globals?.theme as ThemeSetting) ?? "light";
  const theme = useThemeGlobal(initial);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <DocsContainer context={context} theme={isDark(theme) ? docsThemes.dark : docsThemes.light}>
      {children}
    </DocsContainer>
  );
}

/** Story canvas: same data-theme switch, plus the app's page background and text color. */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as ThemeSetting) ?? "light";
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <div className="bg-bg text-fg antialiased" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Color theme (data-theme on <html>)",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "system", title: "System", icon: "browser" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: {
    layout: "padded",
    nextjs: { appDirectory: true },
    docs: { container: ThemedDocsContainer },
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: {
      storySort: {
        order: [
          "Overview",
          "System",
          ["System Design", "Use Cases"],
          "Foundations",
          ["Colors", "Typography", "Spacing & Shape", "Patterns"],
          "Primitives",
          "Chat",
          "LMS",
          "Notes",
          "Layout",
        ],
      },
    },
    a11y: { test: "todo" },
  },
};

export default preview;

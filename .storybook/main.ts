import type { StorybookConfig } from "@storybook/nextjs-vite";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
  framework: { name: "@storybook/nextjs-vite", options: {} },
  stories: [
    // Written docs first so the sidebar opens on the overview.
    "../src/stories/**/*.mdx",
    "../src/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    {
      name: "@storybook/addon-docs",
      // MDX is compiled without GitHub-flavored markdown by default; enable it so pipe tables
      // (and task lists, strikethrough, autolinks) in the .mdx pages render.
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
    "@storybook/addon-a11y",
  ],
  docs: { defaultName: "Docs" },
  core: { disableTelemetry: true },
};

export default config;

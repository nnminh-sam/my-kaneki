import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ToolCallCard } from "./ToolCallCard";

/**
 * Shows one agent tool call inside a chat message: running (`call` / `input-streaming`), succeeded
 * (`output.success === true` or `result`), or failed (`error`, `success: false`, or `errorText`).
 * Tools return `{ success, ... }` instead of throwing (src/lib/agent-tools.ts).
 */
const meta = {
  title: "Chat/ToolCallCard",
  component: ToolCallCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolCallCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: { toolName: "lmsSearchKnowledge", state: "input-streaming", input: { subjectSlug: "raft", query: "log replication" } },
};

export const Succeeded: Story = {
  args: {
    toolName: "addTodo",
    state: "output-available",
    input: { title: "Read the Raft paper, section 5" },
    output: { success: true, todo: { id: 42, title: "Read the Raft paper, section 5", done: false } },
  },
};

export const Failed: Story = {
  args: {
    toolName: "getVercelDeployments",
    state: "output-available",
    input: { limit: 5 },
    output: { success: false, error: "No Vercel token configured" },
  },
};

export const Errored: Story = {
  args: { toolName: "updateNote", state: "error", input: { path: "notes/today.md" }, errorText: "GitHub returned 409: stale sha" },
};

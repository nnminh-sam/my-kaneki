import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AgentChatInput } from "./AgentChatInput";

/**
 * Chat composer: auto-growing textarea, Enter to send / Shift+Enter for a newline, a Stop button while the
 * agent is generating, and `ModelSwitcher` for a per-message provider/model override. In Storybook the model
 * list request to `/api/ai/config` has no backend, so the switcher shows its fallback state.
 */
const meta = {
  title: "Chat/AgentChatInput",
  component: AgentChatInput,
  tags: ["autodocs"],
  args: { onSend: fn(), onStop: fn(), onModelChange: fn(), isGenerating: false },
  decorators: [
    (Story) => (
      <div className="max-w-2xl pt-48">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgentChatInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Generating: Story = { args: { isGenerating: true } };

/** Tutor variant used next to an LMS module (`TutorSidekick`). */
export const WithBadge: Story = {
  args: { headerBadge: "Tutor · Leader election", placeholder: "Ask the tutor about this module…" },
};

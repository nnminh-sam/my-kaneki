import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { UIMessage } from "ai";
import { ChatMessage } from "./ChatMessage";

/**
 * One message in the agent chat. Renders the AI SDK `UIMessage.parts`: `text` (markdown + math),
 * `reasoning` (collapsible), and tool parts (`tool-<name>` / `dynamic-tool` → `ToolCallCard`).
 */
const meta = {
  title: "Chat/ChatMessage",
  component: ChatMessage,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

const user: UIMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "Add a todo to read section 5 of the Raft paper, then summarise it." }],
};

const assistant = {
  id: "m2",
  role: "assistant",
  parts: [
    { type: "reasoning", text: "The user wants a todo and a summary. Add the todo first.", state: "done" },
    {
      type: "tool-addTodo",
      toolCallId: "call_1",
      state: "output-available",
      input: { title: "Read Raft paper §5" },
      output: { success: true, todo: { id: 42, title: "Read Raft paper §5" } },
    },
    {
      type: "text",
      text: "Added **Read Raft paper §5** to your todos.\n\nSection 5 covers:\n\n1. Leader election with randomized timeouts\n2. Log replication — an entry commits once a majority stores it ($\\lfloor n/2 \\rfloor + 1$)\n3. Safety: only up-to-date candidates can win",
      state: "done",
    },
  ],
} as UIMessage;

export const FromUser: Story = { args: { message: user } };

export const FromAssistantWithTool: Story = { args: { message: assistant } };

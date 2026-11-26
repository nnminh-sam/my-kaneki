import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ActionModal } from "./ActionModal";

/**
 * The app's only dialog. Three modes via `type`: `prompt` (text input, e.g. new/rename note),
 * `confirm` (yes/no, `isDestructive` turns the confirm button red) and `alert` (single button).
 * Used by `NoteEditor` for file operations.
 */
const meta = {
  title: "Primitives/ActionModal",
  component: ActionModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { isOpen: true, onConfirm: fn(), onCancel: fn() },
  decorators: [
    (Story) => (
      <div className="min-h-[420px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = {
  args: {
    type: "prompt",
    title: "New note",
    description: "Path inside the notes repository.",
    inputPlaceholder: "folder/note-name.md",
    defaultValue: "inbox/",
    confirmText: "Create",
  },
};

export const ConfirmDestructive: Story = {
  args: {
    type: "confirm",
    title: "Delete note?",
    description: "notes/old-ideas.md will be deleted with a commit to GitHub.",
    confirmText: "Delete",
    isDestructive: true,
  },
};

export const Loading: Story = {
  args: {
    type: "confirm",
    title: "Delete note?",
    description: "Committing to GitHub…",
    confirmText: "Delete",
    isDestructive: true,
    isLoading: true,
  },
};

export const Alert: Story = {
  args: {
    type: "alert",
    title: "Note changed on GitHub",
    description: "Someone pushed a newer version. Reload to see it before saving again.",
    confirmText: "OK",
  },
};

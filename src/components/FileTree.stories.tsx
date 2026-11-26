import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { FileTree } from "./FileTree";

/**
 * File browser for the GitHub-backed notes repository (`/notes`). Builds a folder tree from the flat
 * `getRepoTree` list; each row has actions for rename, move, copy and delete (each a GitHub commit).
 */
const meta = {
  title: "Notes/FileTree",
  component: FileTree,
  tags: ["autodocs"],
  args: {
    files: [
      { path: "inbox.md", sha: "a1" },
      { path: "learning/raft.md", sha: "b2" },
      { path: "learning/paxos.md", sha: "c3" },
      { path: "projects/my_kaneki/roadmap.md", sha: "d4" },
      { path: "projects/my_kaneki/ideas.md", sha: "e5" },
      { path: "journal/2026-11-26.md", sha: "f6" },
    ],
    selectedPath: "learning/raft.md",
    branchName: "main",
    onSelectFile: fn(),
    onNewFile: fn(),
    onRenameFile: fn(),
    onMoveFile: fn(),
    onCopyFile: fn(),
    onDeleteFile: fn(),
    onRefresh: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[460px] w-72 border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = { args: { files: [], isLoading: true } };

export const Empty: Story = { args: { files: [], selectedPath: "" } };

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MarkdownPreview } from "./MarkdownPreview";

/**
 * Renders notes and LMS module markdown: GitHub-flavored markdown (`remark-gfm`), math (`remark-math` +
 * `rehype-katex`, with `normalizeLatexMath` converting `\(…\)` / `\[…\]` delimiters).
 */
const meta = {
  title: "Primitives/MarkdownPreview",
  component: MarkdownPreview,
  tags: ["autodocs"],
} satisfies Meta<typeof MarkdownPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = {
  args: {
    content: `# Raft consensus

Raft elects a **leader** that replicates a log to followers. See [the paper](https://raft.github.io/).

## Checklist

- [x] Leader election
- [ ] Log replication
- [ ] Snapshots

| Term | Meaning |
| --- | --- |
| \`term\` | Monotonic election counter |
| \`commitIndex\` | Highest entry known to be committed |

\`\`\`ts
function isMajority(votes: number, cluster: number) {
  return votes > Math.floor(cluster / 2);
}
\`\`\`

> A write is committed once stored on a majority.
`,
  },
};

export const Math: Story = {
  args: {
    content: `Quorum size for $n$ nodes is $q = \\lfloor n/2 \\rfloor + 1$.

$$
P(\\text{split vote}) \\approx \\frac{1}{k}
$$

Bracket delimiters are normalized too: \\(a^2 + b^2 = c^2\\).`,
  },
};

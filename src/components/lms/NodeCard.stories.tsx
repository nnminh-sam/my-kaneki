import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NodeCard } from "./NodeCard";
import { NODES, SUBJECT_SLUG } from "@/stories/fixtures/lms";

/**
 * One module (node) of a learning path DAG on `/learning/[slug]`. The look follows `status`:
 * `locked` → `unlocked` → `in_progress` → `completed`, or `mastered_by_placement` when the placement test
 * put the learner above this level. Passing a node's mastery-gate quiz unlocks its dependents.
 */
const meta = {
  title: "LMS/NodeCard",
  component: NodeCard,
  tags: ["autodocs"],
  args: { subjectSlug: SUBJECT_SLUG, prerequisiteNames: [] },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NodeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = { args: { node: NODES[4], prerequisiteNames: ["Log replication"] } };
export const Unlocked: Story = { args: { node: NODES[3], prerequisiteNames: ["Leader election"] } };
export const InProgress: Story = { args: { node: NODES[2], prerequisiteNames: ["Failure detectors"] } };
export const Completed: Story = { args: { node: NODES[1] } };
export const MasteredByPlacement: Story = { args: { node: NODES[0] } };

/** All statuses side by side. */
export const AllStatuses: Story = {
  args: { node: NODES[0] },
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2" style={{ width: 720 }}>
      {NODES.map((n) => (
        <NodeCard key={n.id} node={n} subjectSlug={SUBJECT_SLUG} prerequisiteNames={[]} />
      ))}
    </div>
  ),
  decorators: [],
};

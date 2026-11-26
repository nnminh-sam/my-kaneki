import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CapstoneBanner } from "./CapstoneBanner";
import { NoSubjectsOnboarding } from "./NoSubjectsOnboarding";
import { PlacementBanner } from "./PlacementBanner";
import { NODES, PLACEMENT_IN_PROGRESS, SUBJECT, SUBJECT_SLUG } from "@/stories/fixtures/lms";

/** Banners and empty states on the learning pages (`/learning`, `/learning/[slug]`). */
const meta = {
  title: "LMS/Banners & onboarding",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/learning` when the owner has no subjects yet. Subjects are created by the agent (chat or MCP), not a form. */
export const NoSubjects: Story = { render: () => <NoSubjectsOnboarding /> };

/** Capstone project with milestones mapped to path nodes. */
export const Capstone: Story = {
  render: () => (
    <CapstoneBanner capstoneProject={SUBJECT.capstone_project} subjectSlug={SUBJECT_SLUG} nodes={NODES} />
  ),
};

/** Subject in `placement` status before the test starts (starting it calls the `startPlacementAction` server action). */
export const PlacementNotStarted: Story = {
  render: () => <PlacementBanner subject={SUBJECT} placementSession={null} firstActiveNode={null} />,
};

/** Placement binary search in progress (tiers 1–16, currently probing tier 8). */
export const PlacementInProgress: Story = {
  render: () => (
    <PlacementBanner
      subject={SUBJECT}
      placementSession={PLACEMENT_IN_PROGRESS}
      firstActiveNode={null}
      activePlacementQuizId="quiz_pl_8"
    />
  ),
};

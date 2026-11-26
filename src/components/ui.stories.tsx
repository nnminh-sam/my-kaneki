import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoadingBar, LoadingSpinner, Skeleton, SubmitButton } from "./ui";

/**
 * Shared low-level primitives from `src/components/ui.tsx`: loading states and the form submit button.
 * Everything else (buttons, inputs, cards, badges) is a class recipe — see **Foundations / Patterns**.
 */
const meta = {
  title: "Primitives/Loading & Submit",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Spinner in three sizes; `label` adds visible text and is announced through `role="status"`. */
export const Spinner: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <LoadingSpinner size="sm" />
      <LoadingSpinner size="md" />
      <LoadingSpinner size="lg" label="Loading sessions…" />
    </div>
  ),
};

/** Indeterminate top bar used while a route segment streams in (`loading.tsx`). */
export const Bar: Story = {
  render: () => (
    <div className="w-96">
      <LoadingBar />
    </div>
  ),
};

/** Placeholder blocks; compose them to match the shape of the content being loaded. */
export const Skeletons: Story = {
  render: () => (
    <div className="w-80 space-y-3 rounded-xl border border-border bg-surface p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-7 w-20 rounded-lg" />
        <Skeleton className="h-7 w-16 rounded-lg" />
      </div>
    </div>
  ),
};

/**
 * Submit button for server-action forms: reads `useFormStatus()` and shows `pendingText` while the action runs.
 * Styling is passed in with `className` (here: the primary button recipe). Click to see the pending state.
 */
export const Submit: Story = {
  render: () => (
    <form
      action={async () => {
        await new Promise((r) => setTimeout(r, 1500));
      }}
    >
      <SubmitButton
        pendingText="Saving…"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
      >
        Save
      </SubmitButton>
    </form>
  ),
};

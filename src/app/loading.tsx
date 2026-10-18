import { LoadingSpinner } from "@/components/ui";

export default function RootLoading() {
  return (
    <div
      className="flex min-h-screen flex-1 items-center justify-center bg-bg text-fg"
      aria-busy="true"
      aria-label="Loading page"
    >
      <LoadingSpinner size="lg" label="Loading…" />
    </div>
  );
}

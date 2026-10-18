import { LoadingBar, LoadingSpinner } from "@/components/ui";

export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" aria-busy="true" aria-label="Loading workspace">
      <LoadingBar />
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <LoadingSpinner size="lg" label="Loading…" />
      </div>
    </div>
  );
}

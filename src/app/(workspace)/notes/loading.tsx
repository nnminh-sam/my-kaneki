import { LoadingBar, Skeleton } from "@/components/ui";

export default function NotesLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" aria-busy="true" aria-label="Loading notes">
      <LoadingBar />
      <div className="flex h-full w-full flex-1 flex-col overflow-hidden p-4 sm:p-5">
        <div className="flex h-full w-full flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {/* File Tree Sidebar Skeleton (desktop) */}
          <div className="hidden w-64 flex-col border-r border-border bg-surface-subtle/40 p-3 md:flex">
            {/* Tree header bar */}
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
              <Skeleton className="h-4 w-16" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-6 w-6 rounded-md" />
              </div>
            </div>

            {/* Branch pill skeleton */}
            <div className="mb-3">
              <Skeleton className="h-6 w-24 rounded-md" />
            </div>

            {/* Tree file list items */}
            <div className="space-y-1.5">
              {[68, 82, 54, 76, 62, 46, 70].map((width, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded px-2 py-1.5">
                  <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                  <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </div>

          {/* Editor & Preview Area Skeleton */}
          <div className="flex flex-1 flex-col overflow-hidden p-3 sm:p-4">
            {/* Top action / status bar skeleton */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-6 w-32 rounded" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-md sm:w-16" />
                <Skeleton className="h-7 w-7 rounded-md bg-accent/40 sm:w-24" />
              </div>
            </div>

            {/* Editor Textarea placeholder */}
            <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface p-4">
              {/* Document title */}
              <Skeleton className="mb-4 h-6 w-1/3 rounded" />

              {/* Paragraph block 1 */}
              <div className="space-y-2.5">
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>

              {/* Sub-heading */}
              <Skeleton className="mt-6 mb-3 h-5 w-1/4 rounded" />

              {/* Paragraph block 2 */}
              <div className="space-y-2.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

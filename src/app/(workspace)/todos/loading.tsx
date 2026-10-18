import { LoadingBar, Skeleton } from "@/components/ui";

export default function TodosLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" aria-busy="true" aria-label="Loading todos">
      <LoadingBar />
      <div className="mx-auto w-full max-w-2xl flex-1 p-6">
        {/* Page Title skeleton */}
        <div className="mb-4">
          <Skeleton className="h-7 w-24" />
        </div>

        {/* Add Todo Input form skeleton */}
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-9.5 flex-1 rounded-md border border-border bg-surface" />
          <Skeleton className="h-9.5 w-16 rounded-md bg-accent/40" />
        </div>

        {/* Tabs and search bar skeleton */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Skeleton className="h-8 w-16 rounded-md bg-accent-soft" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-8 w-48 rounded-md border border-border bg-surface" />
        </div>

        {/* Todo items list skeleton */}
        <div className="divide-y divide-border rounded-md border border-border bg-surface">
          {[72, 48, 64, 38, 56].map((width, idx) => (
            <div key={idx} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded border border-border" />
              <Skeleton className="h-4" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

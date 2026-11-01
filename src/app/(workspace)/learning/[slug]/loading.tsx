import { LoadingBar, Skeleton } from "@/components/ui";

export default function SubjectViewLoading() {
  return (
    <div
      className="flex flex-1 flex-col space-y-6"
      aria-busy="true"
      aria-label="Loading learning workspace"
    >
      <LoadingBar />
      <div className="mx-auto max-w-5xl w-full space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs"
            >
              <Skeleton className="h-5 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
              <div className="mt-2 flex items-center justify-between">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

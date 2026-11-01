"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function SubjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LMS View Error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <div className="rounded-2xl border border-danger/30 bg-surface p-8 shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-bold text-fg">
          Unable to load learning module
        </h2>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          {error.message || "An unexpected error occurred while loading this view."}
        </p>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 cursor-pointer transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

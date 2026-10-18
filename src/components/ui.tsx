"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText,
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-surface-subtle ${className}`}
      {...props}
    />
  );
}

export function LoadingBar({ className = "" }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading page content"
      aria-busy="true"
      className={`relative h-0.5 w-full overflow-hidden bg-accent-soft ${className}`}
    >
      <div className="h-full w-full origin-left animate-indeterminate bg-accent" />
    </div>
  );
}

export function LoadingSpinner({
  size = "md",
  className = "",
  label,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }[size];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-muted ${className}`}
    >
      <Loader2 className={`${sizeClasses} animate-spin text-accent`} />
      {label && <span className="text-xs font-medium">{label}</span>}
    </div>
  );
}


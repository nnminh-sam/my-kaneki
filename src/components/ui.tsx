"use client";

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

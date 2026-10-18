import Link from "next/link";
import { Terminal } from "lucide-react";
import { lockedMessage, type AuthMode } from "@/lib/auth";
import { SubmitButton } from "@/components/ui";
import { AUTH_ERROR_MESSAGES, type AuthError } from "@/lib/auth/users";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium tracking-wider text-muted uppercase">Central Workspace</p>
            <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
          </div>
        </div>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}

export function ModeNotice({ mode }: { mode: Exclude<AuthMode, "jwt"> }) {
  if (mode === "open") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-3.5 text-sm text-muted">
        <p>
          Local open mode is active because <code className="font-mono text-xs text-fg">JWT_SECRET</code> is not set yet.
        </p>
        <Link
          href="/"
          className="mt-2 inline-block font-medium text-accent underline underline-offset-4"
        >
          Open workspace →
        </Link>
      </div>
    );
  }
  return (
    <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm text-danger">
      {lockedMessage()}
    </p>
  );
}

export function ErrorMessage({ code }: { code?: string }) {
  if (!code) return null;
  const message = AUTH_ERROR_MESSAGES[code as AuthError] ?? "Something went wrong. Please try again.";
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string },
) {
  const { label, id, ...input } = props;
  const inputId = id ?? `field-${input.name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        {...input}
        placeholder={input.placeholder ?? label}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
      />
    </div>
  );
}

export function AuthSubmit({
  children,
  pendingText,
}: {
  children: React.ReactNode;
  pendingText: string;
}) {
  return (
    <SubmitButton
      pendingText={pendingText}
      className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 dark:text-black"
    >
      {children}
    </SubmitButton>
  );
}

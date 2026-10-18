import Link from "next/link";
import { signUp } from "@/app/actions";
import { AuthCard, AuthSubmit, ErrorMessage, Field, ModeNotice } from "@/components/auth-form";
import { authMode, safeNext } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { signupStatus } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const mode = authMode();
  const back = safeNext(next);

  let status: "open" | "invite" | "closed" | "db_unavailable" | null = null;
  if (mode === "jwt") {
    try {
      status = await signupStatus();
    } catch {
      status = "db_unavailable";
    }
  }

  const loginLink = (
    <Link href={`/login?next=${encodeURIComponent(back)}`} className="font-medium text-accent underline">
      Log in
    </Link>
  );

  return (
    <AuthCard title="Create an account">
      {mode !== "jwt" ? (
        <ModeNotice mode={mode} />
      ) : status === "db_unavailable" ? (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          Cannot reach Neon database. Verify <code className="font-mono text-xs">DATABASE_URL</code> and run{" "}
          <code className="font-mono text-xs">npm run db:migrate</code>.
        </p>
      ) : status === "closed" ? (
        <p className="mt-3 text-sm text-muted">
          Sign-up is closed: this workspace already has an owner account. Add your email to{" "}
          <code className="font-mono text-xs text-fg">KANEKI_SIGNUP_EMAILS</code>, or {loginLink}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            {status === "open"
              ? "Create the primary owner account for my_kaneki."
              : "Sign-up is restricted to invited emails (KANEKI_SIGNUP_EMAILS)."}
          </p>
          <form action={signUp} className="mt-4 space-y-3.5">
            <input type="hidden" name="next" value={back} />
            <Field name="name" label="Name" type="text" placeholder="Your name" autoFocus autoComplete="name" />
            <Field name="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
            <Field
              name="password"
              label={`Password (${MIN_PASSWORD_LENGTH}+ characters)`}
              type="password"
              placeholder="••••••••••••"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
            <Field
              name="confirm"
              label="Confirm password"
              type="password"
              placeholder="••••••••••••"
              required
              autoComplete="new-password"
            />
            <ErrorMessage code={error} />
            <AuthSubmit pendingText="Creating account…">Sign up</AuthSubmit>
          </form>
          <p className="mt-4 text-center text-sm text-muted">Already have an account? {loginLink}</p>
        </>
      )}
    </AuthCard>
  );
}

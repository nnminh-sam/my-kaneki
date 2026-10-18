import Link from "next/link";
import { login } from "@/app/actions";
import { AuthCard, AuthSubmit, ErrorMessage, Field, ModeNotice } from "@/components/auth-form";
import { authMode, safeNext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const mode = authMode();
  const back = safeNext(next);

  return (
    <AuthCard title="Log in to my_kaneki" subtitle="Sign in to access your central workspace.">
      {mode !== "jwt" ? (
        <ModeNotice mode={mode} />
      ) : (
        <>
          <form action={login} className="mt-4 space-y-3.5">
            <input type="hidden" name="next" value={back} />
            <Field
              name="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
            />
            <Field
              name="password"
              label="Password"
              type="password"
              placeholder="••••••••••••"
              required
              autoComplete="current-password"
            />
            <ErrorMessage code={error} />
            <AuthSubmit pendingText="Logging in…">Log in</AuthSubmit>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            No account yet?{" "}
            <Link href={`/signup?next=${encodeURIComponent(back)}`} className="font-medium text-accent underline">
              Sign up
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}

import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { SESSION_COOKIE, authMode, authenticate } from "@/lib/auth";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const mode = authMode();
  const session =
    mode === "jwt"
      ? authenticate({ sessionCookie: (await cookies()).get(SESSION_COOKIE)?.value })
      : null;

  const user = session ? { email: session.email, name: session.name } : null;

  return (
    <div className="flex h-dvh overflow-hidden flex-col md:flex-row">
      <Sidebar mode={mode} user={user} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">{children}</main>
    </div>
  );
}

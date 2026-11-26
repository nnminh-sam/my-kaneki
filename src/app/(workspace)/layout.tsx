import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { currentTheme } from "@/lib/current-theme";
import { SESSION_COOKIE, authMode, authenticate } from "@/lib/auth";
import { currentOwnerId } from "@/lib/owner";
import { FEATURES, getEffectiveFlags, type FeatureId } from "@/lib/features";
import { hiddenNavItemIds } from "@/lib/navigation";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const mode = authMode();
  const session =
    mode === "jwt"
      ? authenticate({ sessionCookie: (await cookies()).get(SESSION_COOKIE)?.value })
      : null;

  const theme = await currentTheme();
  const user = session ? { email: session.email, name: session.name } : null;

  // Unauthenticated requests are denied by the proxy; with no owner there are no flags to read.
  const owner = await currentOwnerId();
  let hiddenNavIds: string[] = [];
  if (owner !== null) {
    const flags = await getEffectiveFlags(owner);
    const enabled: Partial<Record<FeatureId, boolean>> = {};
    for (const feature of FEATURES) enabled[feature.id] = flags[feature.id].enabled;
    hiddenNavIds = hiddenNavItemIds(enabled);
  }

  return (
    <div className="flex h-dvh overflow-hidden flex-col md:flex-row">
      <Sidebar mode={mode} user={user} theme={theme} hiddenNavIds={hiddenNavIds} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">{children}</main>
    </div>
  );
}

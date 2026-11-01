"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bot,
  CheckSquare,
  Cpu,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  Rocket,
  ShieldCheck,
  Terminal,
  Wallet,
} from "lucide-react";
import { logout } from "@/app/actions";
import type { VercelDeploymentsApiResponse } from "@/app/api/vercel/deployments/route";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import { OllamaUsageModal } from "@/components/chat/OllamaUsageModal";
import { SubmitButton } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";
import {
  EXTERNAL_APPS,
  WORKSPACE_NAV_ITEMS,
  type ExternalAppItem,
  type WorkspaceNavItem,
} from "@/lib/navigation";
import type { AuthMode } from "@/lib/auth";
import type { VercelDeploymentState } from "@/lib/vercel";

export { CollapsibleSidebar } from "@/components/CollapsibleSidebar";

function WorkspaceIcon({
  icon,
  className,
}: {
  icon: WorkspaceNavItem["icon"];
  className?: string;
}) {
  switch (icon) {
    case "agent":
      return <Bot className={className} />;
    case "home":
      return <LayoutDashboard className={className} />;
    case "learning":
      return <BookOpen className={className} />;
    case "todos":
      return <CheckSquare className={className} />;
    case "notes":
      return <FileText className={className} />;
    case "deployments":
      return <Rocket className={className} />;
    case "ai-provider":
      return <Cpu className={className} />;
    case "audit":
      return <ShieldCheck className={className} />;
  }
}

function StatusDot({ state }: { state?: VercelDeploymentState }) {
  if (!state) return null;
  if (state === "READY") {
    return (
      <span
        title="Vercel Deployment: Ready"
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
      />
    );
  }
  if (state === "BUILDING" || state === "INITIALIZING" || state === "QUEUED") {
    return (
      <span
        title={`Vercel Deployment: ${state}`}
        className="h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse"
      />
    );
  }
  if (state === "ERROR") {
    return (
      <span
        title="Vercel Deployment: Error"
        className="h-2 w-2 shrink-0 rounded-full bg-danger"
      />
    );
  }
  return null;
}

function ExternalAppIcon({
  icon,
  className,
}: {
  icon: ExternalAppItem["icon"];
  className?: string;
}) {
  switch (icon) {
    case "finance":
      return <Wallet className={className} />;
    case "pm":
      return <FolderKanban className={className} />;
  }
}

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  mode,
  user,
  theme,
}: {
  mode: AuthMode;
  user: { email: string; name?: string } | null;
  theme: Theme;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [appStatuses, setAppStatuses] = useState<
    Record<string, VercelDeploymentState>
  >({});
  const [buildingCount, setBuildingCount] = useState(0);

  useEffect(() => {
    let active = true;
    const loadVercelStatuses = async () => {
      try {
        const res = await fetch("/api/vercel/deployments?limit=25", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as VercelDeploymentsApiResponse;
        if (!active || !json.data) return;
        const nextMap: Record<string, VercelDeploymentState> = {};
        for (const [appId, info] of Object.entries(
          json.data.externalAppStatuses,
        )) {
          nextMap[appId] = info.state;
        }
        setAppStatuses(nextMap);
        setBuildingCount(json.data.counts.building + json.data.counts.queued);
      } catch {}
    };
    void loadVercelStatuses();
    const timer = setInterval(() => void loadVercelStatuses(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <div className="flex items-center gap-2.5 font-semibold tracking-tight">
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={mobileOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent cursor-pointer"
          >
            <Terminal className="h-4 w-4" />
          </button>
          <Link href="/">my_kaneki</Link>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle initial={theme} variant="icon" />
          <OllamaUsageModal variant="icon" />
        </div>
      </header>

      <CollapsibleSidebar
        icon={<Terminal className="h-4 w-4" />}
        title="my_kaneki"
        description="Central Workspace"
        headerHref="/"
        ariaLabel="Workspace sidebar"
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        footer={({ collapsed }) => (
          <>
            {/* Ollama usage and Theme switch: desktop sidebar only (mobile uses top navbar) */}
            <div
              className={`mb-3 hidden border-b border-border pb-3 md:flex ${
                collapsed ? "flex-col items-center gap-2" : "flex-col gap-2.5"
              }`}
            >
              <OllamaUsageModal variant="sidebar" collapsed={collapsed} />
              <ThemeToggle initial={theme} collapsed={collapsed} />
            </div>
            {mode === "jwt" && user ? (
              <div
                className={`flex items-center gap-2.5 ${collapsed ? "md:flex-col" : "justify-between"}`}
              >
                {!collapsed && (
                  <div className="min-w-0 flex-1 px-1">
                    <p className="truncate text-xs font-medium text-fg">
                      {user.name || user.email.split("@")[0]}
                    </p>
                    <p
                      className="truncate text-[11px] text-muted"
                      title={user.email}
                    >
                      {user.email}
                    </p>
                  </div>
                )}
                <form action={logout}>
                  <SubmitButton
                    pendingText="…"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {!collapsed && <span>Log out</span>}
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <div
                className={`flex items-center justify-between gap-2 ${collapsed ? "md:justify-center" : ""}`}
              >
                {!collapsed && (
                  <div className="min-w-0 flex-1 px-1">
                    <p className="truncate text-xs font-medium text-fg">
                      Local Open Mode
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      Set JWT_SECRET to enable auth
                    </p>
                  </div>
                )}
                <Link
                  href="/login"
                  title="Auth settings / Log in"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-subtle hover:text-fg"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {!collapsed && <span>Auth</span>}
                </Link>
              </div>
            )}
          </>
        )}
      >
        {({ collapsed, closeMobile }) => (
          <>
            {/* Internal Workspace Section */}
            <div>
              <nav aria-label="Workspace navigation" className="space-y-0.5">
                {WORKSPACE_NAV_ITEMS.map((item) => {
                  const active = isRouteActive(pathname, item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={closeMobile}
                      title={
                        collapsed
                          ? `${item.label} — ${item.description}`
                          : item.description
                      }
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-muted hover:bg-surface-subtle hover:text-fg"
                      } ${collapsed ? "md:justify-center" : ""}`}
                    >
                      <WorkspaceIcon
                        icon={item.icon}
                        className={`h-4 w-4 shrink-0 ${active ? "text-accent" : "text-muted group-hover:text-fg"}`}
                      />
                      {!collapsed && (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="truncate leading-tight">{item.label}</p>
                            {item.id === "deployments" && buildingCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {buildingCount}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] font-normal text-muted/80">
                            {item.description}
                          </p>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Section divider */}
            <hr className="mx-2 border-t border-border" />

            {/* Connected External Apps */}
            <div>
              <nav
                aria-label="Connected external applications"
                className="space-y-0.5"
              >
                {EXTERNAL_APPS.map((app) => (
                  <a
                    key={app.id}
                    href={app.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMobile}
                    title={`${app.label} (${app.href})`}
                    className={`group flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-subtle hover:text-fg ${
                      collapsed ? "md:justify-center" : ""
                    }`}
                  >
                    <ExternalAppIcon
                      icon={app.icon}
                      className="h-4 w-4 shrink-0 text-muted group-hover:text-accent"
                    />
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-mono text-xs font-medium text-fg">
                              {app.label}
                            </p>
                            <StatusDot state={appStatuses[app.id]} />
                          </div>
                          <p className="truncate text-[11px] text-muted/80">
                            {app.description}
                          </p>
                        </div>
                        <ExternalLink
                          className="h-3.5 w-3.5 shrink-0 text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg"
                          aria-label="Opens in a new tab"
                        />
                      </>
                    )}
                  </a>
                ))}
              </nav>
            </div>
          </>
        )}
      </CollapsibleSidebar>
    </>
  );
}

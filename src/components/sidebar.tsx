"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bot,
  CheckSquare,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import { logout } from "@/app/actions";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import { OllamaUsageModal } from "@/components/chat/OllamaUsageModal";
import { SubmitButton } from "@/components/ui";
import {
  EXTERNAL_APPS,
  WORKSPACE_NAV_ITEMS,
  type ExternalAppItem,
  type WorkspaceNavItem,
} from "@/lib/navigation";
import type { AuthMode } from "@/lib/auth";

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
  }
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
}: {
  mode: AuthMode;
  user: { email: string; name?: string } | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Terminal className="h-4 w-4" />
          </span>
          <span>my_kaneki</span>
        </Link>
        <div className="flex items-center gap-1">
          <OllamaUsageModal variant="icon" />
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="rounded-lg p-2 text-muted hover:bg-surface-subtle hover:text-fg"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
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
            {/* Ollama usage: desktop sidebar only (mobile uses the top navbar button) */}
            <div className="mb-3 hidden border-b border-border pb-3 md:block">
              <OllamaUsageModal variant="sidebar" collapsed={collapsed} />
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
                          <p className="truncate leading-tight">{item.label}</p>
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
                          <p className="truncate font-mono text-xs font-medium text-fg">
                            {app.label}
                          </p>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import { logout } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import {
  EXTERNAL_APPS,
  WORKSPACE_NAV_ITEMS,
  type ExternalAppItem,
  type WorkspaceNavItem,
} from "@/lib/navigation";
import type { AuthMode } from "@/lib/auth";

function WorkspaceIcon({
  icon,
  className,
}: {
  icon: WorkspaceNavItem["icon"];
  className?: string;
}) {
  switch (icon) {
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
  const [collapsed, setCollapsed] = useState(false);
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
      </header>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        aria-label="Workspace sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface transition-all duration-200 md:static md:z-auto ${
          collapsed ? "md:w-18" : "md:w-68"
        } ${mobileOpen ? "w-72 translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Brand Header */}
        <div
          className={`flex items-center justify-between border-b border-border px-3.5 ${
            collapsed
              ? "h-15 md:h-auto md:flex-col md:justify-center md:gap-2 md:py-3"
              : "h-15"
          }`}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "md:justify-center" : ""}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Terminal className="h-4 w-4" />
            </span>
            {!collapsed && (
              <div className="truncate">
                <p className="text-sm font-semibold tracking-tight text-fg">
                  my_kaneki
                </p>
                <p className="truncate text-[11px] text-muted">
                  Central Workspace
                </p>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg md:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {/* Internal Workspace Section */}
          <div>
            <nav aria-label="Workspace navigation" className="space-y-0.5">
              {WORKSPACE_NAV_ITEMS.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
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
          <hr className="border-t border-border mx-2" />

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
                  onClick={() => setMobileOpen(false)}
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
        </div>

        {/* User / Auth Footer */}
        <div className="border-t border-border p-3">
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
        </div>
      </aside>
    </>
  );
}

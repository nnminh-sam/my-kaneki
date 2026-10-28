"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

export interface CollapsibleSidebarRenderState {
  collapsed: boolean;
  closeMobile: () => void;
}

export interface CollapsibleSidebarProps {
  /** Icon rendered in the header badge and as the default icon of the expand button when collapsed */
  icon: ReactNode;
  /** Primary title in the header */
  title: string;
  /** Optional subtitle/description in the header */
  description?: string;
  /** Optional link href for the header brand area when expanded */
  headerHref?: string;
  /** Accessible label for the <aside> element */
  ariaLabel?: string;
  /** Controlled collapsed state */
  collapsed?: boolean;
  /** Initial collapsed state when uncontrolled */
  defaultCollapsed?: boolean;
  /** Callback fired when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Controlled mobile drawer open state */
  mobileOpen?: boolean;
  /** Initial mobile drawer open state when uncontrolled */
  defaultMobileOpen?: boolean;
  /** Callback fired when mobile drawer open state changes */
  onMobileOpenChange?: (open: boolean) => void;
  /** Desktop width class when expanded (default: "md:w-68") */
  expandedWidthClass?: string;
  /** Desktop width class when collapsed (default: "md:w-18") */
  collapsedWidthClass?: string;
  /** When collapsed, temporarily expand (as an overlay) while the mouse hovers the sidebar */
  expandOnHover?: boolean;
  /** Main scrollable body content */
  children: ReactNode | ((state: CollapsibleSidebarRenderState) => ReactNode);
  /** Optional footer content */
  footer?: ReactNode | ((state: CollapsibleSidebarRenderState) => ReactNode);
}

export function CollapsibleSidebar({
  icon,
  title,
  description,
  headerHref,
  ariaLabel,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  mobileOpen: controlledMobileOpen,
  defaultMobileOpen = false,
  onMobileOpenChange,
  expandedWidthClass = "md:w-68",
  collapsedWidthClass = "md:w-18",
  expandOnHover = false,
  children,
  footer,
}: CollapsibleSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [internalMobileOpen, setInternalMobileOpen] =
    useState(defaultMobileOpen);

  const [hovered, setHovered] = useState(false);

  const pinnedCollapsed = controlledCollapsed ?? internalCollapsed;
  const hoverExpanded = expandOnHover && pinnedCollapsed && hovered;
  const isCollapsed = pinnedCollapsed && !hoverExpanded;
  const isMobileOpen = controlledMobileOpen ?? internalMobileOpen;

  const setCollapsed = (next: boolean) => {
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  const setMobileOpen = (next: boolean) => {
    if (controlledMobileOpen === undefined) {
      setInternalMobileOpen(next);
    }
    onMobileOpenChange?.(next);
  };

  const closeMobile = () => setMobileOpen(false);

  const renderState: CollapsibleSidebarRenderState = {
    collapsed: isCollapsed,
    closeMobile,
  };

  const brandContent = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </span>
      <div className="truncate">
        <p className="truncate text-sm font-semibold tracking-tight text-fg">
          {title}
        </p>
        {description && (
          <p className="truncate text-[11px] text-muted">{description}</p>
        )}
      </div>
    </>
  );

  const wrapperClass = expandOnHover
    ? `md:relative md:h-full md:shrink-0 ${pinnedCollapsed ? collapsedWidthClass : expandedWidthClass}`
    : "contents";

  return (
    <div
      className={wrapperClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        aria-label={ariaLabel ?? title}
        className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 ${
          expandOnHover
            ? `md:absolute md:left-0 md:top-0 md:h-full ${hoverExpanded ? "md:z-30 md:shadow-xl" : "md:z-10"}`
            : "md:static md:z-auto"
        } ${
          isCollapsed ? collapsedWidthClass : expandedWidthClass
        } ${isMobileOpen ? "w-72 translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Brand / Header */}
        <div
          className={`flex h-15 shrink-0 items-center justify-between border-b border-border px-3.5 ${
            isCollapsed ? "md:justify-center" : ""
          }`}
        >
          {!isCollapsed &&
            (headerHref ? (
              <Link
                href={headerHref}
                onClick={closeMobile}
                className="flex min-w-0 items-center gap-2.5 overflow-hidden"
              >
                {brandContent}
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                {brandContent}
              </div>
            ))}

          {isCollapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="group hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition-colors hover:bg-surface-subtle hover:text-fg md:inline-flex cursor-pointer"
            >
              <span className="flex items-center justify-center group-hover:hidden">
                {icon}
              </span>
              <PanelLeftOpen className="hidden h-4 w-4 group-hover:block" />
            </button>
          ) : hoverExpanded ? (
            <button
              type="button"
              onClick={() => {
                setCollapsed(false);
                setHovered(false);
              }}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="hidden rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg md:inline-flex cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="hidden rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg md:inline-flex cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-subtle hover:text-fg md:hidden cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {typeof children === "function" ? children(renderState) : children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="border-t border-border p-3">
            {typeof footer === "function" ? footer(renderState) : footer}
          </div>
        )}
      </aside>
    </div>
  );
}

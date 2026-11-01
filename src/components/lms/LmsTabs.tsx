"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { getLmsTabs } from "./lms-nav-items";

interface LmsTabsProps {
  slug: string;
  dueReviewsCount: number;
  escalationCount: number;
  activeNodeId?: string | null;
  activeQuizId?: string | null;
}

export function LmsTabs({
  slug,
  dueReviewsCount,
  escalationCount,
  activeNodeId,
  activeQuizId,
}: LmsTabsProps) {
  const pathname = usePathname();
  const tabListRef = useRef<HTMLDivElement>(null);

  const tabs = getLmsTabs({
    slug,
    pathname,
    activeNodeId,
    activeQuizId,
    dueReviewsCount,
    escalationCount,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const focusable = tabListRef.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]');
    if (!focusable || focusable.length === 0) return;

    const list = Array.from(focusable);
    const currentIndex = list.indexOf(document.activeElement as HTMLAnchorElement);
    if (currentIndex === -1) return;

    e.preventDefault();
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % list.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + list.length) % list.length;
    }
    list[nextIndex]?.focus();
    list[nextIndex]?.click();
  };

  return (
    <nav
      aria-label="Learning workspace navigation"
      className="border-b border-border bg-surface px-6 overflow-x-auto"
    >
      <div
        ref={tabListRef}
        role="tablist"
        onKeyDown={handleKeyDown}
        className="flex space-x-1"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              role="tab"
              aria-selected={tab.isActive}
              href={tab.href}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-xs font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                tab.isActive
                  ? "border-accent text-accent font-semibold"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.badge != null && (
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-semibold leading-none ${
                    tab.badgeVariant === "warn"
                      ? "bg-warn-soft text-warn border border-warn/30"
                      : "bg-accent-soft text-accent"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

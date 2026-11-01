import {
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  FileBox,
  GitFork,
  MessageSquareDiff,
  type LucideIcon,
} from "lucide-react";

export interface LmsTabItem {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  badgeVariant?: "accent" | "warn";
  description?: string;
  isActive: boolean;
}

export function getLmsTabs({
  slug,
  pathname,
  activeNodeId,
  activeQuizId,
  dueReviewsCount,
  escalationCount,
}: {
  slug: string;
  pathname: string;
  activeNodeId?: string | null;
  activeQuizId?: string | null;
  dueReviewsCount: number;
  escalationCount: number;
}): LmsTabItem[] {
  return [
    {
      id: "dag",
      label: "Learning Path (DAG)",
      shortLabel: "Learning Path",
      href: `/learning/${slug}`,
      icon: GitFork,
      description: "Knowledge graph & prerequisites",
      isActive: pathname === `/learning/${slug}`,
    },
    {
      id: "reader",
      label: "Active Module",
      shortLabel: "Active Module",
      href: activeNodeId
        ? `/learning/${slug}/module/${activeNodeId}`
        : `/learning/${slug}/module`,
      icon: BookOpen,
      description: "Module reader & concepts",
      isActive: pathname.startsWith(`/learning/${slug}/module`),
    },
    {
      id: "quiz",
      label: "Mastery Gate Quiz",
      shortLabel: "Mastery Quiz",
      href: activeQuizId
        ? `/learning/${slug}/quiz/${activeQuizId}`
        : `/learning/${slug}/quiz`,
      icon: CheckCircle2,
      description: "Assess understanding & unlock",
      isActive: pathname.startsWith(`/learning/${slug}/quiz`),
    },
    {
      id: "srs",
      label: "Daily Spaced Repetition",
      shortLabel: "Spaced Repetition",
      href: `/learning/${slug}/review`,
      icon: CalendarCheck2,
      badge: dueReviewsCount > 0 ? dueReviewsCount : undefined,
      badgeVariant: "accent",
      description: "FSRS review cards",
      isActive: pathname.startsWith(`/learning/${slug}/review`),
    },
    {
      id: "research",
      label: "Agent Research & Debate",
      shortLabel: "Research & Debate",
      href: `/learning/${slug}/research`,
      icon: MessageSquareDiff,
      badge: escalationCount > 0 ? escalationCount : undefined,
      badgeVariant: "warn",
      description: "Contradiction resolution",
      isActive: pathname.startsWith(`/learning/${slug}/research`),
    },
    {
      id: "sources",
      label: "BYOS Knowledge Hub",
      shortLabel: "Knowledge Hub",
      href: `/learning/${slug}/sources`,
      icon: FileBox,
      description: "Ingested sources & docs",
      isActive: pathname.startsWith(`/learning/${slug}/sources`),
    },
  ];
}

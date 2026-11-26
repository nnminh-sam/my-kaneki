import type { FeatureId } from "@/lib/features/registry";

export type WorkspaceNavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon:
    | "agent"
    | "home"
    | "learning"
    | "todos"
    | "notes"
    | "deployments"
    | "ai-provider"
    | "audit"
    | "settings";
  /** When set, the item is shown only while this feature is enabled. */
  feature?: FeatureId;
};

export type ExternalAppItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: "finance" | "pm";
};

export const WORKSPACE_NAV_ITEMS: readonly WorkspaceNavItem[] = [
  {
    id: "agent",
    label: "Agent",
    description: "AI assistant & chat sessions",
    href: "/",
    icon: "agent",
  },
  {
    id: "learning",
    label: "Learning",
    description: "Coding, Research, DSA & System Design",
    href: "/learning",
    icon: "learning",
    feature: "lms",
  },
  {
    id: "todos",
    label: "Todo & Planning",
    description: "Tasks, schedules & milestones",
    href: "/todos",
    icon: "todos",
  },
  {
    id: "notes",
    label: "Notes",
    description: "Knowledge base & study notes",
    href: "/notes",
    icon: "notes",
  },
  {
    id: "deployments",
    label: "Deployments",
    description: "Vercel projects, builds & live status",
    href: "/deployments",
    icon: "deployments",
  },
  {
    id: "ai-provider",
    label: "AI Provider",
    description: "AI providers, models & MCP API keys",
    href: "/ai-provider",
    icon: "ai-provider",
  },
  {
    id: "audit",
    label: "Audit Log",
    description: "Session API calls, tools & telemetry",
    href: "/audit",
    icon: "audit",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Feature switches for this workspace",
    href: "/settings",
    icon: "settings",
  },
] as const;

/** Ids of workspace items whose feature is not enabled. Items without a feature are never hidden. */
export function hiddenNavItemIds(enabled: Partial<Record<FeatureId, boolean>>): string[] {
  return WORKSPACE_NAV_ITEMS.filter((item) => item.feature !== undefined && enabled[item.feature] !== true).map(
    (item) => item.id,
  );
}

export const EXTERNAL_APPS: readonly ExternalAppItem[] = [
  {
    id: "my_finance",
    label: "my_finance",
    description: "Personal finance & calendar tracker",
    href: "https://myfinance-one-hazel.vercel.app/calendar",
    icon: "finance",
  },
  {
    id: "my_pm_agent",
    label: "my_pm_agent",
    description: "Project management & agent tasks",
    href: "https://my-pm-agent-rouge.vercel.app/projects",
    icon: "pm",
  },
] as const;

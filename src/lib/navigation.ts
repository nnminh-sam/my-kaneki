export type WorkspaceNavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: "agent" | "home" | "learning" | "todos" | "notes";
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
    label: "Self-Learning",
    description: "Coding, Research, DSA & System Design",
    href: "/learning",
    icon: "learning",
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
] as const;

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

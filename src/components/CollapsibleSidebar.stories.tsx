import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BookOpen, CheckSquare, FileText, MessageSquare, Rocket } from "lucide-react";
import { CollapsibleSidebar } from "./CollapsibleSidebar";

/**
 * Shell for the workspace sidebar and the learning inner sidebar: expanded / collapsed rail on desktop
 * (`md:w-68` / `md:w-18`), slide-in drawer on mobile. Body and footer can be render functions that receive
 * `{ collapsed, closeMobile }`.
 */
const meta = {
  title: "Layout/CollapsibleSidebar",
  component: CollapsibleSidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    icon: <BookOpen className="h-4 w-4" />,
    title: "my_kaneki",
    description: "Central workspace",
    ariaLabel: "Workspace navigation",
    children: null,
  },
  decorators: [
    (Story) => (
      <div className="flex h-[520px] bg-bg">
        <Story />
        <main className="flex-1 p-6 text-xs text-muted">Page content</main>
      </div>
    ),
  ],
} satisfies Meta<typeof CollapsibleSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { icon: MessageSquare, label: "Agent", active: true },
  { icon: BookOpen, label: "Learning" },
  { icon: CheckSquare, label: "Todo & Planning" },
  { icon: FileText, label: "Notes" },
  { icon: Rocket, label: "Deployments" },
];

function Nav({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="space-y-0.5 p-2">
      {items.map(({ icon: Icon, label, active }) => (
        <a
          key={label}
          href="#"
          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-subtle hover:text-fg"
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && label}
        </a>
      ))}
    </nav>
  );
}

export const Expanded: Story = {
  args: { children: ({ collapsed }) => <Nav collapsed={collapsed} /> },
};

export const Collapsed: Story = {
  args: { defaultCollapsed: true, children: ({ collapsed }) => <Nav collapsed={collapsed} /> },
};

export const CollapsedExpandOnHover: Story = {
  args: { defaultCollapsed: true, expandOnHover: true, children: ({ collapsed }) => <Nav collapsed={collapsed} /> },
};

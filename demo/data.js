/**
 * my_kaneki — Mock Data Store
 * Extracted data objects for the web mock.
 * Easily edit any strings, numbers, or records here.
 */

window.KANEKI_DATA = {
  // Current user session
  user: {
    name: "nnminh",
    email: "nnminh@example.com",
    avatar: "N",
    authMode: "jwt",
  },

  // Theme setting: "light" | "dark" | "system"
  initialTheme: "system",

  // Navigation Items
  navItems: [
    {
      id: "agent",
      label: "Agent",
      description: "AI assistant & chat sessions",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
    },
    {
      id: "learning",
      label: "Self-Learning",
      description: "Coding, Research, DSA & System Design",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>`,
    },
    {
      id: "todos",
      label: "Todo & Planning",
      description: "Tasks, schedules & milestones",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    },
    {
      id: "notes",
      label: "Notes",
      description: "Knowledge base & study notes",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
    },
    {
      id: "settings",
      label: "Settings",
      description: "MCP API keys & AI provider configuration",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    },
  ],

  // External Connected Services
  externalApps: [
    {
      label: "my_finance",
      href: "https://myfinance-one-hazel.vercel.app/calendar",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a8 8 0 0 1-8 5H4a2 2 0 0 1-2-2V6"/></svg>`,
    },
    {
      label: "my_pm_agent",
      href: "https://my-pm-agent-rouge.vercel.app/projects",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/></svg>`,
    },
  ],

  // AI Quota (Ollama Cloud)
  quota: {
    percentRemaining: 98,
    balanceUsd: 9.80,
    allowanceUsd: 10.00,
    resetAt: "Nov 16",
    daysRemaining: "15d",
    totals24h: {
      requestCount: 28,
      usageUsd: 0.042,
      inputTokens: "48.2k",
      outputTokens: "14.6k",
    },
  },

  // Chat Sessions & Active Chat Data
  chat: {
    model: "gemma4:31b-cloud",
    sessions: [
      { id: "s-1", title: "Light/Dark Switch Architecture", date: "Today" },
      { id: "s-2", title: "PostgreSQL Database Migrations", date: "Yesterday" },
      { id: "s-3", title: "LMS Learning Path DAG Engine", date: "Oct 30" },
      { id: "s-4", title: "MCP Tool Server Integration", date: "Oct 28" },
    ],
    promptSuggestions: [
      { label: "Add task", prompt: "Add a todo: Review pull requests and verify design mocks" },
      { label: "Daily study log", prompt: "Create a note for today's learning summary" },
      { label: "LMS Quiz", prompt: "Run a quick check on DAG cycle detection" },
    ],
    messages: [
      {
        role: "user",
        sender: "nnminh",
        avatar: "N",
        text: "Please inspect our PostgreSQL schema migrations and implement the light/dark mode switch persisted in the database per user.",
      },
      {
        role: "assistant",
        sender: "Kaneki Agent",
        avatar: "🤖",
        text: "I have examined your database schema and migrations. The `users` table is active, and I have added migration `008_user_settings.sql` to persist user theme preferences directly in Neon PostgreSQL.",
        toolCall: {
          name: "migrate_database",
          args: '{ "file": "008_user_settings.sql" }',
          result: "Applied on branch default: 008_user_settings",
        },
      },
    ],
  },

  // Todo Items
  todos: [
    { id: 1, title: "Implement light/dark mode switch with DB user settings", done: true },
    { id: 2, title: "Add Option B1 full-width AI quota card to sidebar", done: true },
    { id: 3, title: "Review binary search placement algorithm for LMS", done: false },
    { id: 4, title: "Connect my_pm_agent project management tools", done: false },
    { id: 5, title: "Sync study notes to personal GitHub repository", done: false },
  ],

  // Self-Learning Modules (LMS)
  learning: {
    subject: "Distributed Systems & Cloud Engineering",
    description: "Curriculum with DAG prerequisite graph, active recall, and Spaced Repetition (SM-2).",
    stats: { mastered: 12, inProgress: 4, reviewDue: 2 },
    modules: [
      { id: "m-1", title: "Consensus Algorithms (Raft & Paxos)", tier: "Tier 1", status: "Mastered" },
      { id: "m-2", title: "Vector Embeddings & Hybrid Search", tier: "Tier 2", status: "In Progress" },
      { id: "m-3", title: "High-Throughput Message Queues", tier: "Tier 2", status: "Unlocked" },
      { id: "m-4", title: "CAP Theorem & Partition Tolerance", tier: "Tier 3", status: "Locked" },
    ],
  },

  // Notes Store
  notes: {
    files: [
      { path: "notes/daily-log.md", title: "daily-log.md" },
      { path: "notes/distributed-systems.md", title: "distributed-systems.md" },
      { path: "notes/architecture-decisions.md", title: "architecture-decisions.md" },
      { path: "notes/inbox.md", title: "inbox.md" },
    ],
    activeContent: {
      title: "Architecture Decisions: Light/Dark Mode & User Settings",
      date: "Nov 1, 2026",
      markdown: `## Overview
This document tracks the design and implementation decisions for the workspace theme system and user settings persistence.

### Key Decisions
1. **Database Schema**: Added \`user_settings\` table with foreign key to \`users(id)\` cascading on delete.
2. **Three-State Theme**: Supports \`light\`, \`dark\`, and \`system\`.
3. **No-Flicker Hydration**: \`data-theme\` attribute is resolved server-side before HTML flush via cookie & DB lookup.
4. **Sidebar Design B1**: Full-width progress card for Ollama AI Quota + 3-way segmented control for theme.`,
    },
  },

  // Settings Configuration
  settings: {
    ollamaModel: "gemma4:31b-cloud",
    ollamaBaseUrl: "https://ollama.com/v1",
    mcpEndpoint: "https://my-pm-agent-rouge.vercel.app/api/mcp",
    githubRepo: "my_kaneki-notes",
  },
};

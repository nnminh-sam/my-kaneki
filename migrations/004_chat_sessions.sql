-- Chat sessions / conversations for the AI agent workspace.
-- owner_id is the user id, or '' when the app runs in local open mode (no login).

create table if not exists chat_sessions (
  id text primary key,
  owner_id text not null default '',
  title text not null default 'New Chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_owner_idx on chat_sessions (owner_id, updated_at desc, id desc);

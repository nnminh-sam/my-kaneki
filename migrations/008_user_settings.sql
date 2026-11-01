-- Per-user preferences. One row per user; created lazily on first change.
-- theme: 'light' | 'dark' | 'system' (follow the OS preference).

create table if not exists user_settings (
  user_id text primary key references users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

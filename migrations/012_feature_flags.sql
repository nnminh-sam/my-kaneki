-- Migration 012: Per-owner feature flags.
-- Stores an explicit enabled/disabled choice per (owner, feature). Missing rows fall back to the registry default.

create table if not exists feature_flags (
  owner_id text not null default '',
  feature text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, feature)
);

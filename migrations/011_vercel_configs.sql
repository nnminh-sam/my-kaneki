-- Migration 011: User-managed Vercel API Configuration
-- Stores Vercel Access Token and optional Team ID for monitoring all deployments across projects.

create table if not exists user_vercel_configs (
  owner_id text primary key default '',
  api_token text not null default '',
  team_id text not null default '',
  updated_at timestamptz not null default now()
);

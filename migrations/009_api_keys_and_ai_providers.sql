-- Migration 009: User-managed Inbound MCP API Keys & Multi-Provider AI Configuration
-- Allows users to register personal Bearer tokens for /api/mcp and configure
-- AI providers (Ollama, OpenRouter, OpenAI, Custom) for Chat LLM and LMS Embeddings in DB.

create table if not exists mcp_api_keys (
  id text primary key,
  owner_id text not null default '',
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_api_keys_owner_idx on mcp_api_keys (owner_id, created_at desc);
create index if not exists mcp_api_keys_hash_idx on mcp_api_keys (key_hash);

create table if not exists user_ai_configs (
  owner_id text primary key default '',
  chat_provider text not null default 'ollama' check (chat_provider in ('ollama', 'openrouter', 'openai', 'custom')),
  chat_model text not null default '',
  embedding_provider text not null default 'openrouter' check (embedding_provider in ('openrouter', 'ollama', 'openai', 'custom', 'deterministic')),
  embedding_model text not null default '',
  providers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Migration 007: LMS Usage & Cost Telemetry
-- Records token usage, latency, and operation telemetry for cost control and rate-limiting.

create table if not exists lms_usage_log (
  id text primary key,
  owner_id text not null default '',
  subject_id text references lms_subjects(id) on delete cascade,
  node_id text references lms_nodes(id) on delete set null,
  operation text not null,
  model text not null default '',
  tokens int not null default 0,
  cost_estimate numeric not null default 0.0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lms_usage_log_owner_daily_idx on lms_usage_log (owner_id, created_at desc);
create index if not exists lms_usage_log_subject_idx on lms_usage_log (subject_id);

-- Polymorphic, append-only audit log. Deliberately has no foreign keys: entity_id holds
-- a todo id (bigint as text), a GitHub file path, or any other identifier.

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor text not null check (actor in ('user', 'ai-agent')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);

-- Enforce append-only at the database level.
create or replace function audit_log_immutable() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

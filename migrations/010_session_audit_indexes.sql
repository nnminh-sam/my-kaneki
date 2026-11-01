-- Migration 010: Session-level Audit Log Indexes
-- Optimizes querying audit_log by chat session ID and owner ID for agent debugging and optimization telemetry.

create index if not exists audit_log_session_idx
  on audit_log ((payload->>'sessionId'), created_at desc);

create index if not exists audit_log_owner_idx
  on audit_log ((coalesce(payload->>'ownerId', payload->>'owner_id', '')), created_at desc);

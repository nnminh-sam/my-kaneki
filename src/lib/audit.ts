import { getDb, type Row } from "./db";

export type AuditActor = "user" | "ai-agent";

export interface AuditEntry {
  action: string;
  entityType: string;
  /** Todo id, GitHub file path, or any other identifier. Stored as text. */
  entityId: string;
  actor: AuditActor;
  payload: Record<string, unknown>;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Appends one audit row (standalone; use only after the primary action already succeeded). */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await getDb().query(
    "insert into audit_log (action, entity_type, entity_id, actor, payload) values ($1, $2, $3, $4, $5::jsonb)",
    [entry.action, entry.entityType, entry.entityId, entry.actor, JSON.stringify(entry.payload)],
  );
}

/** History for one entity, newest first. Served by audit_log_entity_idx. */
export async function listAudit(entityType: string, entityId: string, limit = 50): Promise<AuditLogRow[]> {
  const rows: Row[] = await getDb().query(
    `select id, action, entity_type, entity_id, actor, payload, created_at from audit_log
     where entity_type = $1 and entity_id = $2 order by created_at desc, id desc limit $3`,
    [entityType, entityId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actor: r.actor as AuditActor,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

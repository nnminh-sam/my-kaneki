import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export interface McpApiKeyRecord {
  id: string;
  ownerId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedMcpApiKey extends McpApiKeyRecord {
  /** Raw secret token (`knk_...`). Returned only once at creation time. */
  rawKey: string;
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

let mcpKeysTableEnsured = false;

async function ensureMcpApiKeysTable() {
  if (mcpKeysTableEnsured) return;
  const db = getDb();
  await db.query(
    `create table if not exists mcp_api_keys (
       id text primary key,
       owner_id text not null default '',
       name text not null,
       key_prefix text not null,
       key_hash text not null unique,
       last_used_at timestamptz,
       revoked_at timestamptz,
       created_at timestamptz not null default now()
     )`,
  );
  mcpKeysTableEnsured = true;
}

/**
 * Generates and stores a new personal MCP API key for `ownerId`.
 * Only the SHA-256 hash and a short display prefix are persisted in PostgreSQL.
 */
export async function createMcpApiKey(
  ownerId: string,
  name: string,
): Promise<CreatedMcpApiKey> {
  await ensureMcpApiKeysTable();
  const cleanName = name.trim() || "MCP Client Key";
  const id = `mk_${crypto.randomBytes(8).toString("hex")}`;
  const secretPart = crypto.randomBytes(24).toString("hex");
  const rawKey = `knk_${secretPart}`;
  const keyPrefix = `${rawKey.slice(0, 10)}...${rawKey.slice(-4)}`;
  const keyHash = hashApiKey(rawKey);

  const db = getDb();
  const rows = await db.query(
    `insert into mcp_api_keys (id, owner_id, name, key_prefix, key_hash)
     values ($1, $2, $3, $4, $5)
     returning id, owner_id, name, key_prefix, last_used_at, revoked_at, created_at`,
    [id, ownerId, cleanName, keyPrefix, keyHash],
  );

  const row = rows[0];
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    rawKey,
  };
}

/**
 * Lists all MCP API keys belonging to `ownerId`.
 */
export async function listMcpApiKeys(ownerId: string): Promise<McpApiKeyRecord[]> {
  await ensureMcpApiKeysTable();
  const db = getDb();
  const rows = await db.query(
    `select id, owner_id, name, key_prefix, last_used_at, revoked_at, created_at
     from mcp_api_keys
     where owner_id = $1
     order by created_at desc`,
    [ownerId],
  );

  return rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

/**
 * Revokes an MCP API key owned by `ownerId`.
 */
export async function revokeMcpApiKey(ownerId: string, keyId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.query(
    `update mcp_api_keys
     set revoked_at = now()
     where id = $1 and owner_id = $2 and revoked_at is null
     returning id`,
    [keyId, ownerId],
  );
  return rows.length > 0;
}

/**
 * Verifies a Bearer token against active `mcp_api_keys` in the database.
 * Updates `last_used_at` asynchronously on match.
 */
export async function verifyDatabaseMcpApiKey(
  rawToken: string,
): Promise<{ ownerId: string; keyId: string } | null> {
  if (!rawToken) return null;
  const keyHash = hashApiKey(rawToken);
  try {
    const db = getDb();
    const rows = await db.query(
      `update mcp_api_keys
       set last_used_at = now()
       where key_hash = $1 and revoked_at is null
       returning id, owner_id`,
      [keyHash],
    );
    if (rows.length === 0) return null;
    return {
      keyId: String(rows[0].id),
      ownerId: String(rows[0].owner_id),
    };
  } catch {
    // Gracefully return null if table is not yet migrated or DB is unavailable
    return null;
  }
}

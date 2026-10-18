import { getDb } from "./db";

export type Todo = { id: string; title: string; done: boolean; created_at: string };

export const MAX_TODO_LENGTH = 500;

function rowToTodo(row: Record<string, unknown>): Todo {
  return {
    id: String(row.id),
    title: String(row.title),
    done: Boolean(row.done),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
  };
}

/** Escapes LIKE wildcards so the search is a literal "contains" match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Lists an owner's todos, newest first. `onlyOpen` hides done ones; `query` is a case-insensitive contains filter. */
export async function listTodos(
  ownerId: string,
  { onlyOpen = false, query = "" }: { onlyOpen?: boolean; query?: string } = {},
): Promise<Todo[]> {
  const q = query.trim();
  const rows = await getDb().query(
    `select id, title, done, created_at from todos
     where owner_id = $1
       and ($2::boolean = false or done = false)
       and ($3 = '' or title ilike '%' || $3 || '%' escape '\\')
     order by created_at desc, id desc`,
    [ownerId, onlyOpen, escapeLike(q)],
  );
  return rows.map(rowToTodo);
}

export async function addTodo(ownerId: string, title: string): Promise<boolean> {
  const text = title.trim().slice(0, MAX_TODO_LENGTH);
  if (!text) return false;
  await getDb().query("insert into todos (owner_id, title) values ($1, $2)", [ownerId, text]);
  return true;
}

export async function setTodoDone(ownerId: string, id: string, done: boolean): Promise<void> {
  if (!/^\d+$/.test(id)) return;
  await getDb().query(
    "update todos set done = $3, completed_at = case when $3 then now() else null end where id = $2::bigint and owner_id = $1",
    [ownerId, id, done],
  );
}

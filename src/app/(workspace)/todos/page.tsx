import Link from "next/link";
import { redirect } from "next/navigation";
import { addTodoAction, toggleTodoAction } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { currentOwnerId } from "@/lib/owner";
import { MAX_TODO_LENGTH, listTodos } from "@/lib/todos";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ view?: string; q?: string }>;

export default async function TodosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === "all" ? "all" : "todo";
  const q = (params.q ?? "").slice(0, 200);

  const owner = await currentOwnerId();
  if (owner === null) redirect("/login?next=/todos");

  let todos: Awaited<ReturnType<typeof listTodos>> = [];
  let dbError = false;
  try {
    todos = await listTodos(owner, { onlyOpen: view === "todo", query: q });
  } catch {
    dbError = true;
  }

  const tabHref = (v: string) => {
    const sp = new URLSearchParams();
    if (v === "all") sp.set("view", "all");
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/todos?${s}` : "/todos";
  };
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg"}`;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-semibold">Todos</h1>

      <form action={addTodoAction} className="mb-4 flex gap-2">
        <input
          name="title"
          required
          maxLength={MAX_TODO_LENGTH}
          placeholder="Add a task…"
          autoComplete="off"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <SubmitButton className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg">Add</SubmitButton>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex gap-1">
          <Link href={tabHref("todo")} className={tabClass(view === "todo")}>
            To do
          </Link>
          <Link href={tabHref("all")} className={tabClass(view === "all")}>
            All tasks
          </Link>
        </nav>
        <form method="get" className="ml-auto flex gap-2">
          {view === "all" && <input type="hidden" name="view" value="all" />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search tasks…"
            className="w-48 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </form>
      </div>

      {dbError ? (
        <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          Couldn&apos;t load tasks. Check the database connection and run <code>npm run db:migrate</code>.
        </p>
      ) : todos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {q ? "No tasks match your search." : view === "todo" ? "Nothing left to do." : "No tasks yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
              <form action={toggleTodoAction} className="flex items-center">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="done" value={String(!t.done)} />
                <button
                  type="submit"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? "Mark as not done" : "Mark as done"}
                  className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded border text-xs ${
                    t.done ? "border-accent bg-accent text-bg" : "border-border hover:border-accent"
                  }`}
                >
                  {t.done ? "✓" : ""}
                </button>
              </form>
              <span className={`flex-1 break-words text-sm ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

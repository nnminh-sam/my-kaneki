import { tool } from "ai";
import { z } from "zod";
import { addTodo, MAX_TODO_LENGTH } from "@/lib/todos";
import { saveNote, type ErrorCode } from "@/actions/github";

export type ToolResult<T extends object = object> = ({ success: true } & T) | { success: false; error: string };

function failure(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

const GITHUB_LABELS: Partial<Record<ErrorCode, string>> = {
  CONFLICT: "GitHub API 409 Conflict (stale SHA; re-read the note and retry)",
  RATE_LIMITED: "GitHub API 403 Rate Limit (try again later)",
  UNAUTHORIZED: "GitHub API 403 Forbidden (token rejected)",
  NOT_FOUND: "GitHub API 404 Not Found",
};

/**
 * Agent tools for one authenticated owner. Failures are returned as `{success:false, error}`
 * so the model can react; nothing here throws into the stream.
 */
export function createAgentTools(ownerId: string) {
  return {
    addTodo: tool({
      description: "Add a todo item to the user's todo list.",
      inputSchema: z.object({ title: z.string().min(1).max(MAX_TODO_LENGTH) }),
      execute: async ({ title }): Promise<ToolResult<{ title: string }>> => {
        try {
          // Todo + audit row are written atomically inside addTodo.
          const created = await addTodo(ownerId, title, "ai-agent");
          if (!created) return { success: false, error: "Title is empty." };
          return { success: true, title: title.trim().slice(0, MAX_TODO_LENGTH) };
        } catch (err) {
          return failure(err);
        }
      },
    }),

    updateNote: tool({
      description: "Create or overwrite a markdown note in the GitHub notes repo.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Relative repo path, e.g. notes/ideas.md"),
        content: z.string().describe("Full new markdown content of the note."),
        baseSha: z.string().nullish().describe("Blob sha the edit is based on, for conflict detection."),
      }),
      execute: async ({ path, content, baseSha }): Promise<ToolResult<{ path: string; commitUrl?: string }>> => {
        try {
          // saveNote audits (actor "ai-agent") only after GitHub accepts the PUT.
          const res = await saveNote(path, content, baseSha ?? null, "ai-agent");
          if (!res.ok) return { success: false, error: GITHUB_LABELS[res.code] ?? res.error };
          return { success: true, path, commitUrl: res.commitUrl };
        } catch (err) {
          return failure(err);
        }
      },
    }),
  };
}

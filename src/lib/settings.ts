import { getDb } from "./db";
import { parseTheme, type Theme } from "./theme";

/** The user's saved theme, or null if they haven't chosen one. */
export async function getUserTheme(userId: string): Promise<Theme | null> {
  const rows = await getDb().query("select theme from user_settings where user_id = $1", [userId]);
  return parseTheme(rows[0]?.theme);
}

export async function setUserTheme(userId: string, theme: Theme): Promise<void> {
  await getDb().query(
    `insert into user_settings (user_id, theme) values ($1, $2)
     on conflict (user_id) do update set theme = excluded.theme, updated_at = now()`,
    [userId, theme],
  );
}

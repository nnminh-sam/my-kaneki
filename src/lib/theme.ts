export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "kaneki_theme";

export function parseTheme(value: unknown): Theme | null {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value) ? (value as Theme) : null;
}

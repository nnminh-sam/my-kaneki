import { cookies } from "next/headers";
import { SESSION_COOKIE, authMode, authenticate } from "@/lib/auth";
import { getUserTheme } from "@/lib/settings";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";

/** Theme for this request: the signed-in user's DB setting, else the theme cookie, else "system". */
export async function currentTheme(): Promise<Theme> {
  const jar = await cookies();
  const fromCookie = parseTheme(jar.get(THEME_COOKIE)?.value);
  if (authMode() === "jwt") {
    const session = authenticate({ sessionCookie: jar.get(SESSION_COOKIE)?.value });
    if (session) {
      try {
        return (await getUserTheme(session.sub)) ?? fromCookie ?? "system";
      } catch {
        // DB unavailable: fall through to the cookie.
      }
    }
  }
  return fromCookie ?? "system";
}

import { cookies } from "next/headers";
import { SESSION_COOKIE, authMode, authenticate } from "@/lib/auth";

/** Data owner for the current request: the signed-in user's id, "" in local open mode, null if unauthenticated. */
export async function currentOwnerId(): Promise<string | null> {
  const mode = authMode();
  if (mode === "open") return "";
  if (mode === "locked") return null;
  const session = authenticate({ sessionCookie: (await cookies()).get(SESSION_COOKIE)?.value });
  return session?.sub ?? null;
}

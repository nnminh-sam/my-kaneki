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

/** Data owner for a route handler request: cookie or Bearer session, "" in open mode, null if unauthenticated. */
export async function requestOwnerId(req: Request): Promise<string | null> {
  const mode = authMode();
  if (mode === "open") return "";
  if (mode === "locked") return null;

  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.headers.get("cookie");
  const cookieMatch = cookieHeader?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const sessionCookie = cookieMatch ? cookieMatch[1] : undefined;

  const session = authenticate({ authorization: authHeader, sessionCookie });
  return session?.sub ?? null;
}

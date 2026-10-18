import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authenticate } from "@/lib/auth";
import { jsonError, requireJwtMode } from "@/lib/auth/http";

export async function GET(request: NextRequest) {
  const notConfigured = requireJwtMode();
  if (notConfigured) return notConfigured;
  const claims = authenticate({
    authorization: request.headers.get("authorization"),
    sessionCookie: request.cookies.get(SESSION_COOKIE)?.value,
  });
  if (!claims) return jsonError(401, "unauthorized", "Authentication required.");
  return NextResponse.json(
    {
      user: {
        id: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email.split("@")[0],
      },
      expires_at: new Date(claims.exp * 1000).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

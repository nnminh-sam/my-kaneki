import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  authMode,
  authenticate,
  bearerToken,
  clearedSessionCookieOptions,
  isSecureRequest,
  lockedMessage,
  renewSession,
  safeNext,
  sessionCookieOptions,
} from "@/lib/auth";

const AUTH_PAGES = new Set(["/login", "/signup"]);

function deny(request: NextRequest, message: string, clearCookie: boolean) {
  const secure = isSecureRequest(request.headers.get("x-forwarded-proto"));
  let response: NextResponse;
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response = NextResponse.json(
      { error: "unauthorized", message },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="my_kaneki"' } },
    );
  } else {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    response = NextResponse.redirect(login);
  }
  if (clearCookie) response.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions(secure));
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = authMode();
  if (mode === "open") return NextResponse.next();

  const isAuthPage = AUTH_PAGES.has(pathname);
  if (mode === "locked") {
    if (isAuthPage) return NextResponse.next();
    return deny(request, lockedMessage(), false);
  }

  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const authorization = request.headers.get("authorization");
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;

  if (isAuthPage) {
    const session = authenticate({ authorization, sessionCookie: cookie });
    if (session && request.method === "GET") {
      return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    }
    return NextResponse.next();
  }

  const session = authenticate({ authorization, sessionCookie: cookie });
  if (!session) {
    const message = "Log in, or send Authorization: Bearer <token> with a valid session JWT.";
    return deny(request, message, Boolean(cookie) && !bearerToken(authorization));
  }

  const response = NextResponse.next();
  if (!bearerToken(authorization)) {
    const renewed = renewSession(session);
    if (renewed) {
      const secure = isSecureRequest(request.headers.get("x-forwarded-proto"));
      response.cookies.set(SESSION_COOKIE, renewed.token, sessionCookieOptions(secure));
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?)$).*)",
  ],
};

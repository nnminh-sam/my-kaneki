import {
  JWT_MIN_SECRET_LENGTH,
  SESSION_TTL_SECONDS,
  nowSeconds,
  shouldRenew,
  signJwt,
  verifyJwt,
  type SessionClaims,
} from "./jwt";

/**
 * Auth modes, sessions and request authentication, shared by proxy.ts, API routes and server actions.
 * - `JWT_SECRET` set (>= 32 chars) -> "jwt": users log in with email + password and get a 2 h HS256 session (cookie or bearer).
 * - otherwise "open" locally (no login required during local setup before JWT_SECRET is set) and "locked" on Vercel
 *   or when JWT_SECRET is shorter than 32 characters.
 */

export type { SessionClaims } from "./jwt";

export const SESSION_COOKIE = "kaneki_session";

export type AuthMode = "jwt" | "open" | "locked";
type Env = Record<string, string | undefined>;
type Opts = { env?: Env; now?: number };

export function authMode(env: Env = process.env): AuthMode {
  if (env.JWT_SECRET) return env.JWT_SECRET.length >= JWT_MIN_SECRET_LENGTH ? "jwt" : "locked";
  return env.VERCEL ? "locked" : "open";
}

export function lockedMessage(env: Env = process.env): string {
  return env.JWT_SECRET
    ? `JWT_SECRET must be at least ${JWT_MIN_SECRET_LENGTH} characters, so the app is locked. Set a longer one (openssl rand -hex 32) and restart or redeploy.`
    : `JWT_SECRET isn't configured on this deployment, so the app is locked. Set it (at least ${JWT_MIN_SECRET_LENGTH} characters) and redeploy.`;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function isSecureRequest(forwardedProto: string | null | undefined, env: Env = process.env) {
  return forwardedProto ? forwardedProto === "https" : env.NODE_ENV === "production";
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS };
}

export function clearedSessionCookieOptions(secure: boolean) {
  return { ...sessionCookieOptions(secure), maxAge: 0 };
}

export type Session = { token: string; expires_at: string };

function toSession(token: string, exp: number): Session {
  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

export function issueSession(
  user: { id: string; email: string; name?: string },
  { env = process.env, now = nowSeconds() }: Opts = {},
): Session {
  const token = signJwt(
    { sub: user.id, email: user.email, ...(user.name ? { name: user.name } : {}) },
    env.JWT_SECRET!,
    { ttlSeconds: SESSION_TTL_SECONDS, now },
  );
  return toSession(token, now + SESSION_TTL_SECONDS);
}

export function renewSession(claims: SessionClaims, { env = process.env, now = nowSeconds() }: Opts = {}): Session | null {
  if (!shouldRenew(claims, now)) return null;
  const payload = {
    sub: claims.sub,
    email: claims.email,
    ...(claims.name ? { name: claims.name } : {}),
    auth_time: claims.auth_time,
  };
  const token = signJwt(payload, env.JWT_SECRET!, { ttlSeconds: SESSION_TTL_SECONDS, now });
  return toSession(token, now + SESSION_TTL_SECONDS);
}

// ---------------------------------------------------------------------------
// Request authentication
// ---------------------------------------------------------------------------

export type Credentials = { authorization?: string | null; sessionCookie?: string | null };

export function bearerToken(authorization: string | null | undefined): string | null {
  return authorization?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? null;
}

export function authenticate(
  { authorization, sessionCookie }: Credentials,
  { env = process.env, now = nowSeconds() }: Opts = {},
): SessionClaims | null {
  const jwtSecret = authMode(env) === "jwt" ? env.JWT_SECRET! : null;
  if (!jwtSecret) return null;
  const bearer = bearerToken(authorization);
  if (bearer) {
    return verifyJwt(bearer, jwtSecret, { now });
  }
  if (sessionCookie) return verifyJwt(sessionCookie, jwtSecret, { now });
  return null;
}

export function isAuthorized(credentials: Credentials, opts: Opts = {}): boolean {
  const mode = authMode(opts.env ?? process.env);
  if (mode === "open") return true;
  if (mode === "locked") return false;
  return authenticate(credentials, opts) !== null;
}

/** A same-origin path to return to after login (no `//host` or `/\host`), else "/". */
export function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

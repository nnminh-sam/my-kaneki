import { getDb } from "../db";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  getDummyHash,
  hashPassword,
  validatePassword,
  verifyPassword,
  type ScryptParams,
} from "./password";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
};

export type AuthUser = { id: string; name: string; email: string };

export type AuthError =
  | "invalid_input"
  | "invalid_email"
  | "invalid_password"
  | "password_mismatch"
  | "signup_closed"
  | "email_taken"
  | "invalid_credentials";

export const AUTH_ERROR_STATUS: Record<AuthError, number> = {
  invalid_input: 400,
  invalid_email: 400,
  invalid_password: 400,
  password_mismatch: 400,
  signup_closed: 403,
  email_taken: 409,
  invalid_credentials: 401,
};

export const AUTH_ERROR_MESSAGES: Record<AuthError, string> = {
  invalid_input: "Enter an email and a password.",
  invalid_email: "Enter a valid email address.",
  invalid_password: `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters and not the same as your email.`,
  password_mismatch: "The passwords don't match.",
  signup_closed: "Sign-up is closed.",
  email_taken: "An account with this email already exists.",
  invalid_credentials: "Invalid email or password.",
};

export type AuthOutcome = { ok: true; user: AuthUser } | { ok: false; error: AuthError; message: string };

type Env = Record<string, string | undefined>;

function fail(error: AuthError, message = AUTH_ERROR_MESSAGES[error]): AuthOutcome {
  return { ok: false, error, message };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length >= 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    email: String(row.email),
    password_hash: String(row.password_hash),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
  };
}

export async function countUsers(): Promise<number> {
  const rows = await getDb().query("select count(*)::int as count from users");
  return Number(rows[0]?.count ?? 0);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  const rows = await getDb().query(
    "select id, name, email, password_hash, created_at from users where email = $1 limit 1",
    [normalized],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const rows = await getDb().query(
    "select id, name, email from users where id = $1 limit 1",
    [id],
  );
  if (!rows[0]) return null;
  return {
    id: String(rows[0].id),
    name: typeof rows[0].name === "string" ? rows[0].name : "",
    email: String(rows[0].email),
  };
}

export async function createUser(input: {
  name: string;
  email: string;
  password_hash: string;
}): Promise<UserRecord | null> {
  const normalized = normalizeEmail(input.email);
  const rows = await getDb().query(
    `insert into users (name, email, password_hash)
     values ($1, $2, $3)
     on conflict (email) do nothing
     returning id, name, email, password_hash, created_at`,
    [input.name.trim(), normalized, input.password_hash],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

/** Normalized emails allowed to sign up once the first account exists (`KANEKI_SIGNUP_EMAILS`, comma-separated). */
export function signupAllowlist(env: Env = process.env): Set<string> {
  return new Set((env.KANEKI_SIGNUP_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

/** "open" while there are no users, "invite" when KANEKI_SIGNUP_EMAILS lists emails, else "closed". */
export async function signupStatus(env: Env = process.env): Promise<"open" | "invite" | "closed"> {
  if ((await countUsers()) === 0) return "open";
  return signupAllowlist(env).size > 0 ? "invite" : "closed";
}

export async function signUp(
  input: { name?: unknown; email: unknown; password: unknown; confirm?: unknown },
  { env = process.env, hashParams }: { env?: Env; hashParams?: Partial<ScryptParams> } = {},
): Promise<AuthOutcome> {
  const { password, confirm } = input;
  if (typeof input.email !== "string" || typeof password !== "string") return fail("invalid_input");
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return fail("invalid_email");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  const policy = validatePassword(password, email);
  if (policy) return fail("invalid_password", policy);
  if (confirm !== undefined && confirm !== password) return fail("password_mismatch");

  if ((await countUsers()) > 0 && !signupAllowlist(env).has(email)) return fail("signup_closed");
  if (await findUserByEmail(email)) return fail("email_taken");
  const user = await createUser({
    name: name || email.split("@")[0],
    email,
    password_hash: await hashPassword(password, hashParams),
  });
  if (!user) return fail("email_taken");
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

export async function logIn(input: { email: unknown; password: unknown }): Promise<AuthOutcome> {
  const { password } = input;
  if (typeof input.email !== "string" || typeof password !== "string" || !input.email.trim() || !password) {
    return fail("invalid_input");
  }
  const email = normalizeEmail(input.email);
  const user = isValidEmail(email) ? await findUserByEmail(email) : null;
  const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !ok) return fail("invalid_credentials");
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

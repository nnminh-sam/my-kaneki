"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  authMode,
  clearedSessionCookieOptions,
  isSecureRequest,
  issueSession,
  safeNext,
  sessionCookieOptions,
} from "@/lib/auth";
import { logIn, signUp as signUpUser, type AuthOutcome } from "@/lib/auth/users";

async function secureCookie() {
  return isSecureRequest((await headers()).get("x-forwarded-proto"));
}

async function finishAuth(page: "/login" | "/signup", outcome: AuthOutcome, next: string): Promise<never> {
  if (!outcome.ok) redirect(`${page}?error=${outcome.error}&next=${encodeURIComponent(next)}`);
  const { token } = issueSession(outcome.user);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(await secureCookie()));
  redirect(next);
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function signUp(formData: FormData) {
  const next = safeNext(formData.get("next"));
  if (authMode() !== "jwt") redirect("/signup");
  const outcome = await signUpUser({
    name: field(formData, "name"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  await finishAuth("/signup", outcome, next);
}

export async function login(formData: FormData) {
  const next = safeNext(formData.get("next"));
  if (authMode() !== "jwt") redirect("/login");
  await finishAuth(
    "/login",
    await logIn({ email: field(formData, "email"), password: field(formData, "password") }),
    next,
  );
}

export async function logout() {
  (await cookies()).set(SESSION_COOKIE, "", clearedSessionCookieOptions(await secureCookie()));
  redirect("/login");
}

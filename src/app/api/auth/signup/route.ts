import type { NextRequest } from "next/server";
import { invalidBody, readCredentials, requireJwtMode, sessionResponse } from "@/lib/auth/http";
import { signUp } from "@/lib/auth/users";

export async function POST(request: NextRequest) {
  const notConfigured = requireJwtMode();
  if (notConfigured) return notConfigured;
  const body = await readCredentials(request);
  if (!body) return invalidBody();
  const outcome = await signUp({
    name: body.name,
    email: body.email,
    password: body.password,
    confirm: body.confirm,
  });
  return sessionResponse(request, outcome, 201);
}

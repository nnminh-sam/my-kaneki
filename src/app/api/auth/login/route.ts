import type { NextRequest } from "next/server";
import { invalidBody, readCredentials, requireJwtMode, sessionResponse } from "@/lib/auth/http";
import { logIn } from "@/lib/auth/users";

export async function POST(request: NextRequest) {
  const notConfigured = requireJwtMode();
  if (notConfigured) return notConfigured;
  const body = await readCredentials(request);
  if (!body) return invalidBody();
  const outcome = await logIn({ email: body.email, password: body.password });
  return sessionResponse(request, outcome, 200);
}

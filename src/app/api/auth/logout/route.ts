import type { NextRequest } from "next/server";
import { logoutResponse } from "@/lib/auth/http";

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}

import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpRequestAsync, SESSION_COOKIE } from "@/lib/auth";
import { createLmsMcpServer } from "@/lib/lms/mcp-server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Validates Origin header against Host to protect against DNS rebinding attacks.
 * Non-browser clients (Claude Desktop, Cursor, curl) do not send Origin headers.
 */
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Direct non-browser clients are allowed

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (!host) return false;

    // Direct match or localhost / 127.0.0.1
    return (
      originUrl.host === host ||
      (originUrl.hostname === "localhost" && (host.startsWith("localhost") || host.startsWith("127.0.0.1")))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // 1. DNS Rebinding Guard
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: Invalid Origin header (DNS rebinding guard)" },
        id: null,
      },
      { status: 403 },
    );
  }

  // 2. Authentication check
  const authorization = request.headers.get("authorization");
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;

  const auth = await authenticateMcpRequestAsync({ authorization, sessionCookie });
  if (!auth) {
    await recordAudit({
      action: "lms.mcp.auth_failure",
      entityType: "mcp_endpoint",
      entityId: "api/mcp",
      actor: "user",
      payload: {
        reason: "missing_or_invalid_bearer_token",
        hasAuthHeader: Boolean(authorization),
        hasCookie: Boolean(sessionCookie),
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: Invalid or missing Bearer token." },
        id: null,
      },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="my_kaneki"' },
      },
    );
  }

  // 3. Stateless MCP Request Execution
  const server = createLmsMcpServer(auth.ownerId);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  return await transport.handleRequest(request);
}

export async function GET() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method Not Allowed: Server operates in stateless HTTP mode." },
      id: null,
    },
    { status: 405 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method Not Allowed: Stateless server has no persistent sessions to delete." },
      id: null,
    },
    { status: 405 },
  );
}

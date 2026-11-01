import { redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { querySessionAuditLogs, type SessionAuditResponse } from "@/lib/audit";
import { SessionAuditView } from "@/components/audit/SessionAuditView";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  searchParams: Promise<{ sessionId?: string }>;
}

const EMPTY_RESPONSE: SessionAuditResponse = {
  sessions: [],
  events: [],
  summary: {
    totalEvents: 0,
    totalToolCalls: 0,
    mcpApiCalls: 0,
    llmGenerations: 0,
    entityMutations: 0,
    successCount: 0,
    errorCount: 0,
    successRate: 100,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalDurationMs: 0,
    avgToolDurationMs: 0,
    toolBreakdown: [],
  },
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) redirect("/login");

  const resolvedParams = await searchParams;
  const initialSessionId = resolvedParams.sessionId || "all";

  let initialData: SessionAuditResponse = EMPTY_RESPONSE;
  try {
    initialData = await querySessionAuditLogs(owner, {
      sessionId: initialSessionId,
    });
  } catch (err) {
    console.error("Failed to load initial session audit logs:", err);
  }

  return (
    <div className="flex flex-1 h-full w-full overflow-hidden">
      <SessionAuditView
        initialData={initialData}
        initialSessionId={initialSessionId}
      />
    </div>
  );
}

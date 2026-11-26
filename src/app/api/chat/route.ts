import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { currentOwnerId } from "@/lib/owner";
import { createAgentTools } from "@/lib/agent-tools";
import { buildBaseSystem } from "@/lib/chat-system-prompt";
import { isFeatureEnabled } from "@/lib/features";
import { updateSessionMessages } from "@/lib/chat-db";
import { getPmAgentMcpTools } from "@/lib/mcp";
import { resolveChatLanguageModel, type ChatProviderId } from "@/lib/ai";
import { recordUsage } from "@/lib/lms/usage";
import {
  estimateTextTokens,
  recordLlmGenerationAudit,
  wrapToolsWithSessionAudit,
} from "@/lib/audit";

export const maxDuration = 60;

function formatProviderError(err: unknown): string {
  const target: any = (err as any)?.lastError ?? err;
  const rawBody = target?.responseBody;
  if (typeof rawBody === "string") {
    try {
      const parsed = JSON.parse(rawBody);
      const rawMeta = parsed?.error?.metadata?.raw;
      const msg = parsed?.error?.message;
      if (rawMeta) return `${msg || "Provider error"}: ${rawMeta}`;
      if (msg) return String(msg);
    } catch {}
  }
  if (err instanceof Error) {
    if ((err as any).cause instanceof Error) {
      return `${err.message}: ${(err as any).cause.message}`;
    }
    return err.message;
  }
  return "Agent error";
}

function extractLastUserPrompt(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && Array.isArray(m.parts)) {
      const text = m.parts
        .filter((p) => p?.type === "text" && "text" in p && typeof p.text === "string")
        .map((p) => (p as { text: string }).text)
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

export async function POST(req: Request) {
  const owner = await currentOwnerId();
  if (owner === null) return new Response("Unauthorized", { status: 401 });

  let messages: UIMessage[];
  let sessionId: string | undefined;
  let systemPreamble: string | undefined;
  let providerOverride: ChatProviderId | undefined;
  let modelOverride: string | undefined;

  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      id?: string;
      sessionId?: string;
      systemPreamble?: string;
      provider?: ChatProviderId;
      model?: string;
    };
    messages = body.messages;
    sessionId = body.sessionId ?? body.id;
    systemPreamble = body.systemPreamble;
    providerOverride = body.provider;
    modelOverride = body.model;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { tools: mcpTools, instructions: mcpInstructions, close: closeMcp } = await getPmAgentMcpTools();

  const lms = await isFeatureEnabled(owner, "lms");
  const baseSystem = buildBaseSystem({ lms });

  const preamblePrefix = systemPreamble ? `${systemPreamble}\n\n` : "";

  const system = mcpInstructions
    ? `${preamblePrefix}${baseSystem}\n\nProject management system instructions:\n${mcpInstructions}`
    : Object.keys(mcpTools).length > 0
    ? `${preamblePrefix}${baseSystem} You also have access to connected my_pm project management tools.`
    : `${preamblePrefix}${baseSystem}`;

  const { model, providerId, modelId, baseURL } = await resolveChatLanguageModel(owner, {
    provider: providerOverride,
    model: modelOverride,
  });

  const endpoint = `${baseURL}/chat/completions`;
  const lastUserPrompt = extractLastUserPrompt(messages);

  const startedAt = Date.now();
  const auditedAgentTools = wrapToolsWithSessionAudit(createAgentTools(owner, { lms }), {
    ownerId: owner,
    sessionId,
    isMcp: false,
  });
  const auditedMcpTools = wrapToolsWithSessionAudit(mcpTools, {
    ownerId: owner,
    sessionId,
    isMcp: true,
  });

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools: {
      ...auditedAgentTools,
      ...auditedMcpTools,
    },
    stopWhen: isStepCount(5),
    onFinish: async ({ text, usage, steps, finishReason }) => {
      const durationMs = Date.now() - startedAt;

      const toolNames: string[] = [];
      for (const step of steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          if (tc?.toolName) toolNames.push(tc.toolName);
        }
      }

      const rawIn = usage?.inputTokens ?? 0;
      const rawOut = usage?.outputTokens ?? 0;
      const inputTokens =
        rawIn > 0 ? rawIn : estimateTextTokens(system) + estimateTextTokens(lastUserPrompt);
      const outputTokens =
        rawOut > 0 ? rawOut : estimateTextTokens(text || "") + toolNames.length * 40;
      const totalTokens = inputTokens + outputTokens;

      await Promise.all([
        recordUsage({
          ownerId: owner,
          operation: "agent_tool",
          model: `${providerId}:${modelId}`,
          tokens: totalTokens,
          durationMs,
        }).catch(() => {}),
        recordLlmGenerationAudit({
          ownerId: owner,
          sessionId,
          provider: providerId,
          model: modelId,
          endpoint,
          stepCount: steps?.length || 1,
          finishReason: finishReason ?? "stop",
          inputTokens,
          outputTokens,
          totalTokens,
          durationMs,
          toolCallCount: toolNames.length,
          toolNames,
          prompt: lastUserPrompt,
          completion: text || "",
          messageCount: messages.length,
          status: "success",
        }).catch(() => {}),
      ]);
    },
  });

  // Consume stream on server to guarantee completion and persistence even on client disconnect
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onEnd: async ({ messages: finalMessages }) => {
      await closeMcp();
      if (sessionId) {
        try {
          await updateSessionMessages(owner, sessionId, finalMessages);
        } catch (err) {
          console.error("Failed to persist chat session on stream finish:", err);
        }
      }
    },
    onError: (err) => {
      void closeMcp();
      const formattedErr = formatProviderError(err);
      void recordLlmGenerationAudit({
        ownerId: owner,
        sessionId,
        provider: providerId,
        model: modelId,
        endpoint,
        stepCount: 1,
        finishReason: "error",
        inputTokens: estimateTextTokens(lastUserPrompt),
        outputTokens: 0,
        totalTokens: estimateTextTokens(lastUserPrompt),
        durationMs: Date.now() - startedAt,
        toolCallCount: 0,
        toolNames: [],
        prompt: lastUserPrompt,
        completion: "",
        messageCount: messages.length,
        status: "error",
        error: formattedErr,
      }).catch(() => {});
      return formattedErr;
    },
  });
}

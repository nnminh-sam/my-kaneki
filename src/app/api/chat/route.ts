import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { currentOwnerId } from "@/lib/owner";
import { createAgentTools } from "@/lib/agent-tools";
import { updateSessionMessages } from "@/lib/chat-db";
import { getPmAgentMcpTools } from "@/lib/mcp";

export const maxDuration = 60;

function getOllamaBaseUrl(): string {
  const raw = process.env.OLLAMA_BASE_URL?.trim();
  if (!raw) return "https://ollama.com/v1";
  const clean = raw.replace(/\/+$/, "");
  // Rewrite /api to /v1 so OpenAI-compatible /chat/completions route resolves correctly
  if (clean.endsWith("/api")) {
    return clean.slice(0, -4) + "/v1";
  }
  if (!clean.endsWith("/v1")) {
    return `${clean}/v1`;
  }
  return clean;
}

const ollama = createOpenAICompatible({
  name: "ollama-cloud",
  baseURL: getOllamaBaseUrl(),
  apiKey: process.env.OLLAMA_API_KEY,
});

export async function POST(req: Request) {
  const owner = await currentOwnerId();
  if (owner === null) return new Response("Unauthorized", { status: 401 });

  let messages: UIMessage[];
  let sessionId: string | undefined;

  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      id?: string;
      sessionId?: string;
    };
    messages = body.messages;
    sessionId = body.sessionId ?? body.id;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { tools: mcpTools, instructions: mcpInstructions, close: closeMcp } = await getPmAgentMcpTools();

  const baseSystem =
    "You are the assistant for a personal workspace. Use addTodo and updateNote when asked. " +
    "If a tool returns success:false, tell the user what failed and do not claim it worked.";

  const system = mcpInstructions
    ? `${baseSystem}\n\nProject management system instructions:\n${mcpInstructions}`
    : Object.keys(mcpTools).length > 0
    ? `${baseSystem} You also have access to connected my_pm project management tools.`
    : baseSystem;

  const result = streamText({
    model: ollama(process.env.OLLAMA_MODEL || "gpt-oss:120b"),
    system,
    messages: await convertToModelMessages(messages),
    tools: {
      ...createAgentTools(owner),
      ...mcpTools,
    },
    stopWhen: isStepCount(5),
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
      return err instanceof Error ? err.message : "Agent error";
    },
  });
}

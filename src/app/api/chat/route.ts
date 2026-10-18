import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { currentOwnerId } from "@/lib/owner";
import { createAgentTools } from "@/lib/agent-tools";

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
  try {
    ({ messages } = (await req.json()) as { messages: UIMessage[] });
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const result = streamText({
    model: ollama(process.env.OLLAMA_MODEL || "gpt-oss:120b"),
    system:
      "You are the assistant for a personal workspace. Use addTodo and updateNote when asked. " +
      "If a tool returns success:false, tell the user what failed and do not claim it worked.",
    messages: await convertToModelMessages(messages),
    tools: createAgentTools(owner),
    stopWhen: isStepCount(5),
  });

  return result.toUIMessageStreamResponse({
    onError: (err) => (err instanceof Error ? err.message : "Agent error"),
  });
}

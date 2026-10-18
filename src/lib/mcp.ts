import { createMCPClient } from "@ai-sdk/mcp";

export interface McpIntegrationResult {
  tools: Record<string, any>;
  instructions?: string;
  close: () => Promise<void>;
}

/**
 * Connects to the remote my_pm MCP server over HTTP if MY_PM_API_KEY is configured.
 * Safely falls back to empty tools if not configured or if connection/initialization fails.
 */
export async function getPmAgentMcpTools(): Promise<McpIntegrationResult> {
  const apiKey = process.env.MY_PM_API_KEY?.trim();
  const url = process.env.MY_PM_MCP_URL?.trim() || "https://my-pm-agent-rouge.vercel.app/api/mcp";

  if (!apiKey) {
    return {
      tools: {},
      close: async () => {},
    };
  }

  try {
    const client = await createMCPClient({
      clientName: "kaneki-workspace-agent",
      transport: {
        type: "http",
        url,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        redirect: "follow",
      },
    });

    const tools = await client.tools();

    return {
      tools,
      instructions: client.instructions,
      close: async () => {
        try {
          await client.close();
        } catch (closeErr) {
          console.error("Error closing my_pm MCP client:", closeErr);
        }
      },
    };
  } catch (err) {
    console.error("Failed to connect or retrieve tools from my_pm MCP server:", err);
    return {
      tools: {},
      close: async () => {},
    };
  }
}

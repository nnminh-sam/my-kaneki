import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import {
  getUserAiConfig,
  saveUserAiConfig,
  resolveChatLanguageModel,
  normalizeProviderBaseUrl,
  resetAiTableEnsuredForTests,
} from "./providers";
import {
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  authenticateMcpRequestAsync,
} from "@/lib/auth";

describe("AI Provider Module & Database MCP API Keys", () => {
  async function setupTestDb() {
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push(
            (await pg.query(s.text, s.params)).rows as Record<string, unknown>[],
          );
        }
        return out;
      },
    });

    await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) =>
        (await pg.query(text, params)).rows as Record<string, unknown>[],
    });

    resetAiTableEnsuredForTests();
    return pg;
  }

  it("registers, verifies, lists, and revokes database MCP API keys without .env", async () => {
    await setupTestDb();

    const env = { JWT_SECRET: "abcdefghijklmnopqrstuvwxyz0123456789" };
    const created = await createMcpApiKey("U-1", "Cursor Desktop");
    assert.ok(created.rawKey.startsWith("knk_"));
    assert.equal(created.ownerId, "U-1");
    assert.equal(created.name, "Cursor Desktop");

    // Authenticate against /api/mcp using the database-registered Bearer key (no KANEKI_MCP_API_KEY in env)
    const authRes = await authenticateMcpRequestAsync(
      { authorization: `Bearer ${created.rawKey}` },
      { env },
    );
    assert.deepEqual(authRes, { ownerId: "U-1" });

    // Verify lastUsedAt was recorded
    const keys = await listMcpApiKeys("U-1");
    assert.equal(keys.length, 1);
    assert.ok(keys[0].lastUsedAt);
    assert.equal(keys[0].revokedAt, null);

    // Revoke key and verify subsequent MCP requests are rejected
    const revoked = await revokeMcpApiKey("U-1", created.id);
    assert.equal(revoked, true);

    const afterRevoke = await authenticateMcpRequestAsync(
      { authorization: `Bearer ${created.rawKey}` },
      { env },
    );
    assert.equal(afterRevoke, null);
  });

  it("persists per-user AI provider config (Ollama chat + OpenRouter embeddings) in DB", async () => {
    await setupTestDb();

    await saveUserAiConfig("U-1", {
      chatProvider: "ollama",
      chatModel: "gemma4:31b-cloud",
      embeddingProvider: "openrouter",
      embeddingModel: "openai/text-embedding-3-small",
      providers: {
        ollama: {
          apiKey: "ollama-secret-key-1234",
          baseUrl: "https://ollama.com/api",
        },
        openrouter: {
          apiKey: "sk-or-v1-secret-5678",
          baseUrl: "https://openrouter.ai/api/v1",
          preferredChatModels: [
            "openai/gpt-4o-mini",
            "google/gemma-4-31b-it:free",
          ],
        },
      },
    });

    const config = await getUserAiConfig("U-1", {});
    assert.equal(config.chatProvider, "ollama");
    assert.equal(config.chatModel, "gemma4:31b-cloud");
    assert.equal(config.embeddingProvider, "openrouter");
    assert.equal(config.embeddingModel, "openai/text-embedding-3-small");
    assert.equal(config.providers.ollama?.apiKey, "ollama-secret-key-1234");
    assert.equal(config.providers.openrouter?.apiKey, "sk-or-v1-secret-5678");
    assert.deepEqual(config.providers.openrouter?.preferredChatModels, [
      "openai/gpt-4o-mini",
      "google/gemma-4-31b-it:free",
    ]);

    // Updating model without re-sending apiKey preserves existing stored API keys
    await saveUserAiConfig("U-1", {
      chatProvider: "openrouter",
      chatModel: "anthropic/claude-3.7-sonnet",
      embeddingProvider: "openrouter",
      embeddingModel: "openai/text-embedding-3-small",
      providers: {
        openrouter: { baseUrl: "https://openrouter.ai/api/v1" },
      },
    });

    const updated = await getUserAiConfig("U-1", {});
    assert.equal(updated.chatProvider, "openrouter");
    assert.equal(updated.chatModel, "anthropic/claude-3.7-sonnet");
    assert.equal(updated.providers.openrouter?.apiKey, "sk-or-v1-secret-5678");
    assert.equal(updated.providers.ollama?.apiKey, "ollama-secret-key-1234");

    const resolvedChat = await resolveChatLanguageModel("U-1");
    assert.equal(resolvedChat.providerId, "openrouter");
    assert.equal(resolvedChat.modelId, "anthropic/claude-3.7-sonnet");
    assert.equal(resolvedChat.baseURL, "https://openrouter.ai/api/v1");

    // Per-request model interchange overrides the saved default on the fly
    const overriddenChat = await resolveChatLanguageModel("U-1", {
      provider: "ollama",
      model: "qwen3:32b",
    });
    assert.equal(overriddenChat.providerId, "ollama");
    assert.equal(overriddenChat.modelId, "qwen3:32b");
    assert.equal(overriddenChat.baseURL, "https://ollama.com/v1");
  });

  it("normalizes Ollama and OpenRouter base URLs properly", () => {
    assert.equal(
      normalizeProviderBaseUrl("ollama", "https://ollama.com/api"),
      "https://ollama.com/v1",
    );
    assert.equal(
      normalizeProviderBaseUrl("ollama", "http://localhost:11434"),
      "http://localhost:11434/v1",
    );
    assert.equal(
      normalizeProviderBaseUrl("openrouter", ""),
      "https://openrouter.ai/api/v1",
    );
    assert.equal(
      normalizeProviderBaseUrl(
        "openrouter",
        "https://openrouter.ai/api/v1/responses",
      ),
      "https://openrouter.ai/api/v1",
    );
    assert.equal(
      normalizeProviderBaseUrl(
        "openrouter",
        "https://openrouter.ai/api/v1/chat/completions",
      ),
      "https://openrouter.ai/api/v1",
    );
    assert.equal(
      normalizeProviderBaseUrl(
        "openrouter",
        "https://openrouter.ai/api/v1/embeddings",
      ),
      "https://openrouter.ai/api/v1",
    );
  });
});

import crypto from "node:crypto";

export const EMBEDDING_DIMENSION = 1536;

export interface Embedder {
  dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic pseudo-embedding generator for testing and offline environments.
 * Returns unit-normalized vectors of EMBEDDING_DIMENSION based on text hashing.
 */
export function createDeterministicFakeEmbedder(
  dimension = EMBEDDING_DIMENSION,
): Embedder {
  return {
    dimension,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const hash = crypto.createHash("sha256").update(text).digest();
        const vec = new Array<number>(dimension);
        let sumSq = 0;

        for (let i = 0; i < dimension; i++) {
          // Derive float between -1.0 and 1.0 from byte stream
          const b1 = hash[i % hash.length];
          const b2 = hash[(i * 7 + 13) % hash.length];
          const val = ((b1 ^ b2) / 127.5) - 1.0;
          vec[i] = val;
          sumSq += val * val;
        }

        // Normalize to unit vector
        const norm = Math.sqrt(sumSq) || 1.0;
        return vec.map((v) => Number((v / norm).toFixed(6)));
      });
    },
  };
}

/**
 * Embedder that calls an OpenAI-compatible /v1/embeddings HTTP endpoint
 * (e.g. Ollama, OpenAI, or local vLLM).
 */
export function createHttpEmbedder(params: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  dimension?: number;
  headers?: Record<string, string>;
}): Embedder {
  const dimension = params.dimension ?? EMBEDDING_DIMENSION;
  const rawBase =
    params.baseUrl ||
    process.env.LMS_EMBEDDING_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : "") ||
    process.env.OLLAMA_BASE_URL ||
    "http://localhost:11434/v1";
  const baseUrl = rawBase
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|responses|embeddings|completions|models)$/i, "")
    .replace(/\/+$/, "");
  const apiKey =
    params.apiKey ||
    process.env.LMS_EMBEDDING_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OLLAMA_API_KEY ||
    "";
  const model =
    params.model ||
    process.env.LMS_EMBEDDING_MODEL ||
    (baseUrl.includes("openrouter.ai") ? "openai/text-embedding-3-small" : "text-embedding-3-small");

  return {
    dimension,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const BATCH_SIZE = 16;
      const allVectors: number[][] = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const chunk = texts.slice(i, i + BATCH_SIZE);
        let attempts = 0;
        let lastErr: unknown;

        while (attempts < 3) {
          attempts++;
          try {
            const url = baseUrl.endsWith("/embeddings") ? baseUrl : `${baseUrl}/embeddings`;
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              ...(params.headers ?? {}),
            };
            if (apiKey) {
              headers.Authorization = `Bearer ${apiKey}`;
            }

            const res = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify({ model, input: chunk }),
            });

            if (!res.ok) {
              const errBody = await res.text();
              throw new Error(`Embedding API error ${res.status}: ${errBody}`);
            }

            const data = (await res.json()) as {
              data: Array<{ embedding: number[]; index?: number }>;
            };

            const batchResults = data.data
              .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
              .map((d) => {
                let vec = d.embedding;
                // Ensure exact dimension match (pad or truncate if provider returns different size)
                if (vec.length < dimension) {
                  vec = [...vec, ...new Array(dimension - vec.length).fill(0)];
                } else if (vec.length > dimension) {
                  vec = vec.slice(0, dimension);
                }
                return vec;
              });

            allVectors.push(...batchResults);
            break;
          } catch (err) {
            lastErr = err;
            if (attempts < 3) {
              await new Promise((r) => setTimeout(r, 200 * attempts));
            }
          }
        }

        if (attempts >= 3 && allVectors.length < i + chunk.length) {
          throw new Error(`Failed to generate embeddings after 3 attempts: ${String(lastErr)}`);
        }
      }

      return allVectors;
    },
  };
}

let activeEmbedder: Embedder | undefined;
let isTestOverride = false;

export function setEmbedderForTests(embedder: Embedder | undefined) {
  activeEmbedder = embedder;
  isTestOverride = embedder !== undefined;
}

export function getEmbedder(): Embedder {
  if (!activeEmbedder) {
    // If embedding env is not configured, default to deterministic fake embedder
    // to avoid throwing in local development without external embedding API.
    const hasHttpConfig = Boolean(
      process.env.LMS_EMBEDDING_BASE_URL ||
      process.env.LMS_EMBEDDING_API_KEY ||
      process.env.OPENROUTER_API_KEY,
    );
    activeEmbedder = hasHttpConfig ? createHttpEmbedder({}) : createDeterministicFakeEmbedder();
  }
  return activeEmbedder;
}

/**
 * Resolves the embedder for `ownerId`, respecting test overrides first,
 * then per-user AI provider config in Postgres (with optional override),
 * and finally `.env` / deterministic fallback.
 */
export async function getEmbedderForOwner(
  ownerId = "",
  override?: { provider?: string; model?: string },
): Promise<Embedder> {
  if (isTestOverride && activeEmbedder) {
    return activeEmbedder;
  }
  const { resolveEmbedder } = await import("@/lib/ai/providers");
  return resolveEmbedder(ownerId, {
    provider: override?.provider as any,
    model: override?.model,
  });
}

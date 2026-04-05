import { LRUCache } from "../utils/cache.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Cache embeddings to avoid re-calling Ollama for unchanged text
const embeddingCache = new LRUCache<string, number[]>(1000, 30 * 60 * 1000); // 30min TTL

let ollamaAvailable: boolean | null = null;

export async function checkOllama(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  return ollamaAvailable;
}

// Build the embedding input string — enriched with semantic metadata
export function buildEmbeddingInput(params: {
  name: string;
  type: string;
  summary?: string;
  codeSnippet?: string;
  meta?: { role?: string; tab?: string; feature?: string; route?: string };
}): string {
  const parts = [`[NAME] ${params.name}`, `[TYPE] ${params.type}`];
  if (params.meta?.role) parts.push(`[ROLE] ${params.meta.role}`);
  if (params.meta?.tab) parts.push(`[TAB] ${params.meta.tab}`);
  if (params.meta?.feature) parts.push(`[FEATURE] ${params.meta.feature}`);
  if (params.meta?.route) parts.push(`[ROUTE] ${params.meta.route}`);
  if (params.summary) parts.push(`[SUMMARY] ${params.summary}`);
  if (params.codeSnippet) parts.push(`[CODE] ${params.codeSnippet.slice(0, 300)}`);
  return parts.join("\n");
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Return from cache if available
  const cached = embeddingCache.get(text);
  if (cached) return cached;

  // Skip if Ollama is offline
  if (!(await checkOllama())) return null;

  try {
    const res = await fetch(`${config.ollama.url}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.ollama.model, prompt: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.error("embeddings", `Ollama returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { embedding: number[] };
    const embedding = data.embedding;

    embeddingCache.set(text, embedding);
    return embedding;
  } catch (err) {
    logger.error("embeddings", "failed:", err);
    ollamaAvailable = null; // Reset health check — may be transient
    return null;
  }
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  ollamaAvailable = null;
}

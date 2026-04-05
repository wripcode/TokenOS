import { getAllNodes, updateNodeEmbedding } from "../db/index.js";
import { generateEmbedding, buildEmbeddingInput } from "./client.js";
import { logger } from "../utils/logger.js";

/**
 * Generate and store embeddings for all nodes that don't yet have them.
 * Call after a full initial index to back-fill embeddings.
 */
export async function backfillEmbeddings(): Promise<{ updated: number; skipped: number }> {
  const nodes = getAllNodes();
  let updated = 0;
  let skipped = 0;

  for (const node of nodes) {
    if (node.embedding) {
      skipped++;
      continue;
    }

    const text = buildEmbeddingInput({
      name: node.name,
      type: node.type,
      summary: node.summary ?? undefined,
      codeSnippet: node.code_snippet ?? undefined,
      meta: node.meta ? JSON.parse(node.meta) : undefined,
    });

    const embedding = await generateEmbedding(text);
    if (embedding) {
      updateNodeEmbedding(node.id, embedding);
      updated++;
    } else {
      // Ollama unavailable — stop early
      break;
    }
  }

  return { updated, skipped };
}

export { generateEmbedding, buildEmbeddingInput, checkOllama } from "./client.js";
export { rankBySimilarity, cosineSimilarity } from "./similarity.js";

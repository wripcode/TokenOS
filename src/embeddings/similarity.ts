import type { GraphNode } from "../types.js";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface RankedNode extends GraphNode {
  similarity: number;
}

export function rankBySimilarity(
  queryVector: number[],
  candidates: GraphNode[],
  topK = 10
): RankedNode[] {
  return candidates
    .flatMap((node) => {
      if (!node.embedding) return [];
      try {
        const vec = JSON.parse(node.embedding) as number[];
        return [{ ...node, similarity: cosineSimilarity(queryVector, vec) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

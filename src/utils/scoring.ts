import { batchComputeImportance } from "../db/index.js";
import type { GraphNode } from "../types.js";

/**
 * Compute and store importance scores for all nodes using batch SQL.
 *
 * Score = (inDegree * 2) + outDegree + typeWeight
 *
 * - inDegree (x2): more things depend on this → higher importance
 * - outDegree: broader dependencies indicate a more central node
 * - typeWeight: classes/functions preferred over imports
 */
export function computeAllImportance(): { updated: number } {
  return batchComputeImportance();
}

export function rankNodes(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => b.importance - a.importance);
}

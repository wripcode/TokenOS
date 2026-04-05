import { db } from "./connection.js";
import type { GraphNode, GraphEdge, ParsedNode, ParsedEdge } from "../types.js";

// ───── Node Queries ───────────────────────────────────────────────────────────

const stmtUpsertNode = db.prepare<GraphNode>(`
  INSERT INTO nodes (id, type, name, file_path, summary, code_snippet, embedding, meta, hash, importance, updated_at)
  VALUES (@id, @type, @name, @file_path, @summary, @code_snippet, @embedding, @meta, @hash, @importance, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    type         = excluded.type,
    name         = excluded.name,
    file_path    = excluded.file_path,
    summary      = excluded.summary,
    code_snippet = excluded.code_snippet,
    embedding    = excluded.embedding,
    meta         = excluded.meta,
    hash         = excluded.hash,
    importance   = excluded.importance,
    updated_at   = CURRENT_TIMESTAMP
`);

export function upsertNode(node: Partial<GraphNode> & Pick<GraphNode, "id" | "type" | "name" | "file_path">): void {
  stmtUpsertNode.run({
    summary: null,
    code_snippet: null,
    embedding: null,
    meta: null,
    hash: null,
    importance: 0,
    ...node,
  } as GraphNode);
}

const stmtGetNode = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE id = ?
`);

export function getNode(id: string): GraphNode | undefined {
  return stmtGetNode.get(id);
}

const stmtGetNodesByName = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE name LIKE ? ORDER BY importance DESC
`);

export function getNodesByName(name: string): GraphNode[] {
  return stmtGetNodesByName.all(`%${name}%`);
}

const stmtGetNodesByType = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE type = ? ORDER BY importance DESC
`);

export function getNodesByType(type: string): GraphNode[] {
  return stmtGetNodesByType.all(type);
}

// ── AND filter: name LIKE + type = (fixes OR bug in text search) ──────────────

const stmtGetNodesByNameAndType = db.prepare<[string, string], GraphNode>(`
  SELECT * FROM nodes WHERE name LIKE ? AND type = ? ORDER BY importance DESC
`);

export function getNodesByNameAndType(name: string, type: string): GraphNode[] {
  return stmtGetNodesByNameAndType.all(`%${name}%`, type);
}

// ── Nodes with embeddings (for semantic search — avoids loading ALL nodes) ────

const stmtGetNodesWithEmbeddings = db.prepare<[], GraphNode>(`
  SELECT * FROM nodes WHERE embedding IS NOT NULL
`);

const stmtGetNodesWithEmbeddingsByType = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE embedding IS NOT NULL AND type = ?
`);

export function getNodesWithEmbeddings(type?: string): GraphNode[] {
  if (type) return stmtGetNodesWithEmbeddingsByType.all(type);
  return stmtGetNodesWithEmbeddings.all();
}

const stmtDeleteNodesByFile = db.prepare<[string]>(`
  DELETE FROM nodes WHERE file_path = ?
`);

export function deleteNodesByFile(filePath: string): void {
  stmtDeleteNodesByFile.run(filePath);
}

const stmtGetAllNodes = db.prepare<[], GraphNode>(`
  SELECT * FROM nodes
`);

export function getAllNodes(): GraphNode[] {
  return stmtGetAllNodes.all();
}

const stmtUpdateEmbedding = db.prepare<[string, string]>(`
  UPDATE nodes SET embedding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

export function updateNodeEmbedding(id: string, embedding: number[]): void {
  stmtUpdateEmbedding.run(JSON.stringify(embedding), id);
}

const stmtUpdateImportance = db.prepare<[number, string]>(`
  UPDATE nodes SET importance = ? WHERE id = ?
`);

export function updateNodeImportance(id: string, score: number): void {
  stmtUpdateImportance.run(score, id);
}

// ───── Edge Queries ───────────────────────────────────────────────────────────

const stmtUpsertEdge = db.prepare<GraphEdge>(`
  INSERT OR IGNORE INTO edges (from_node, to_node, type)
  VALUES (@from_node, @to_node, @type)
`);

export function upsertEdge(edge: GraphEdge): void {
  stmtUpsertEdge.run(edge);
}

export const upsertEdgesBatch: (edges: ParsedEdge[]) => void = db.transaction((edges: ParsedEdge[]) => {
  for (const edge of edges) {
    stmtUpsertEdge.run(edge);
  }
});

const stmtDeleteEdgesByFile = db.prepare<[string, string]>(`
  DELETE FROM edges
  WHERE from_node IN (SELECT id FROM nodes WHERE file_path = ?)
     OR to_node   IN (SELECT id FROM nodes WHERE file_path = ?)
`);

export function deleteEdgesByFile(filePath: string): void {
  stmtDeleteEdgesByFile.run(filePath, filePath);
}

const stmtGetNeighbors = db.prepare<[string, string], GraphEdge>(`
  SELECT * FROM edges WHERE from_node = ? OR to_node = ?
`);

export function getNeighbors(nodeId: string): GraphEdge[] {
  return stmtGetNeighbors.all(nodeId, nodeId);
}

const stmtGetConnectedNodes = db.prepare<[string], GraphNode>(`
  SELECT n.*
  FROM   nodes n
  JOIN   edges e ON n.id = e.to_node
  WHERE  e.from_node = ?
  ORDER BY n.importance DESC
`);

export function getConnectedNodes(nodeId: string): GraphNode[] {
  return stmtGetConnectedNodes.all(nodeId);
}

// ───── Graph-wide helpers ────────────────────────────────────────────────────

const stmtInDegree = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count FROM edges WHERE to_node = ?
`);

const stmtOutDegree = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count FROM edges WHERE from_node = ?
`);

export function getInDegree(nodeId: string): number {
  return stmtInDegree.get(nodeId)?.count ?? 0;
}

export function getOutDegree(nodeId: string): number {
  return stmtOutDegree.get(nodeId)?.count ?? 0;
}

const stmtTopNodes = db.prepare<[number], GraphNode>(`
  SELECT * FROM nodes ORDER BY importance DESC LIMIT ?
`);

export function getTopNodes(limit = 20): GraphNode[] {
  return stmtTopNodes.all(limit);
}

// ── Batch importance computation (eliminates N+1) ─────────────────────────────

interface ImportanceRow {
  id: string;
  type: string;
  in_degree: number;
  out_degree: number;
}

const stmtBatchDegrees = db.prepare<[], ImportanceRow>(`
  SELECT
    n.id,
    n.type,
    COALESCE(i.cnt, 0) AS in_degree,
    COALESCE(o.cnt, 0) AS out_degree
  FROM nodes n
  LEFT JOIN (SELECT to_node, COUNT(*) AS cnt FROM edges GROUP BY to_node) i ON i.to_node = n.id
  LEFT JOIN (SELECT from_node, COUNT(*) AS cnt FROM edges GROUP BY from_node) o ON o.from_node = n.id
`);

const TYPE_WEIGHT: Record<string, number> = {
  class: 3,
  component: 2.5,      // primary UI building blocks
  function: 2,
  route: 1.5,           // Next.js route entries
  interface: 1.5,      // structural contracts
  enum: 1.5,           // structural enumerations
  file: 1.5,
  type_alias: 1,       // usually simple aliases
  variable: 1,
  import: 0.5,
};

/**
 * Compute all importance scores in a single SQL query + batch update.
 * Replaces the O(N) individual getInDegree/getOutDegree calls.
 */
export function batchComputeImportance(): { updated: number } {
  const rows = stmtBatchDegrees.all();
  let updated = 0;

  const batchUpdate = db.transaction(() => {
    for (const row of rows) {
      const typeWeight = TYPE_WEIGHT[row.type] ?? 1;
      const score = row.in_degree * 2 + row.out_degree + typeWeight;
      stmtUpdateImportance.run(score, row.id);
      updated++;
    }
  });

  batchUpdate();
  return { updated };
}

// ── Meta queries (semantic role / tab / feature search) ───────────────────────

const stmtGetNodesByMetaRole = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE json_extract(meta, '$.role') = ? ORDER BY importance DESC
`);

const stmtGetNodesByMetaTab = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE json_extract(meta, '$.tab') = ? ORDER BY importance DESC
`);

const stmtGetNodesByMetaFeature = db.prepare<[string], GraphNode>(`
  SELECT * FROM nodes WHERE json_extract(meta, '$.feature') = ? ORDER BY importance DESC
`);

export function getNodesByMeta(
  key: "role" | "tab" | "feature",
  value: string,
): GraphNode[] {
  switch (key) {
    case "role": return stmtGetNodesByMetaRole.all(value);
    case "tab": return stmtGetNodesByMetaTab.all(value);
    case "feature": return stmtGetNodesByMetaFeature.all(value);
  }
}

// ── Combined name + meta search (searches name LIKE query OR meta contains query) ─

const stmtSearchNameOrMeta = db.prepare<[string, string, string, string], GraphNode>(`
  SELECT * FROM nodes
  WHERE name LIKE ?
     OR json_extract(meta, '$.role') = ?
     OR json_extract(meta, '$.tab') = ?
     OR json_extract(meta, '$.feature') = ?
  ORDER BY importance DESC
`);

export function searchNodesExtended(query: string): GraphNode[] {
  return stmtSearchNameOrMeta.all(`%${query}%`, query, query, query);
}

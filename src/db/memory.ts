import { db } from "./connection.js";
import type { ConversationMemory } from "../types.js";

// ───── FTS5 helpers (synced manually, same pattern as nodes_fts) ──────────────

function ftsUpsertMemory(m: { id: string; title: string; summary: string; tags: string }): void {
  try {
    stmtFtsUpsert.run(m.id, m.title, m.summary, m.tags);
  } catch {
    // FTS table may not exist — safe to ignore
  }
}

function ftsDeleteMemory(id: string): void {
  try {
    stmtFtsDelete.run(id);
  } catch {
    // FTS table may not exist — safe to ignore
  }
}

const stmtFtsUpsert = db.prepare<[string, string, string, string]>(`
  INSERT OR REPLACE INTO memories_fts(memory_id, title, summary, tags)
  VALUES (?, ?, ?, ?)
`);

const stmtFtsDelete = db.prepare<[string]>(`
  DELETE FROM memories_fts WHERE memory_id = ?
`);

// ───── Core CRUD ─────────────────────────────────────────────────────────────

const stmtUpsertMemory = db.prepare(`
  INSERT INTO memories (id, title, summary, key_points, tags, embedding, created_at)
  VALUES (@id, @title, @summary, @key_points, @tags, @embedding, @created_at)
  ON CONFLICT(id) DO UPDATE SET
    title      = excluded.title,
    summary    = excluded.summary,
    key_points = excluded.key_points,
    tags       = excluded.tags,
    embedding  = excluded.embedding
`);

export function upsertMemory(m: ConversationMemory): void {
  const tagsJson = JSON.stringify(m.tags);
  stmtUpsertMemory.run({
    id: m.id,
    title: m.title,
    summary: m.summary,
    key_points: JSON.stringify(m.key_points),
    tags: tagsJson,
    embedding: m.embedding ? JSON.stringify(m.embedding) : null,
    created_at: m.created_at,
  });
  ftsUpsertMemory({ id: m.id, title: m.title, summary: m.summary, tags: tagsJson });
}

const stmtGetMemory = db.prepare(`
  SELECT * FROM memories WHERE id = ?
`);

function parseMemoryRow(row: any): ConversationMemory {
  return {
    ...row,
    key_points: JSON.parse(row.key_points),
    tags: JSON.parse(row.tags),
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  };
}

export function getMemory(id: string): ConversationMemory | undefined {
  const row = stmtGetMemory.get(id) as any;
  if (!row) return undefined;
  return parseMemoryRow(row);
}

const stmtGetAllMemories = db.prepare(`
  SELECT * FROM memories ORDER BY created_at DESC
`);

export function getAllMemories(): ConversationMemory[] {
  return stmtGetAllMemories.all().map(parseMemoryRow);
}

const stmtDeleteMemory = db.prepare<[string]>(`
  DELETE FROM memories WHERE id = ?
`);

export function deleteMemory(id: string): boolean {
  ftsDeleteMemory(id);
  const result = stmtDeleteMemory.run(id);
  return result.changes > 0;
}

// ───── Search (FTS5 with LIKE fallback) ──────────────────────────────────────

const FTS_STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "has", "have",
]);

const stmtFtsSearchMemories = db.prepare<[string], { memory_id: string }>(`
  SELECT memory_id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT 20
`);

const stmtLikeSearchMemories = db.prepare(`
  SELECT * FROM memories 
  WHERE title LIKE ? OR summary LIKE ? OR tags LIKE ?
  ORDER BY created_at DESC
`);

export function searchMemories(query: string): ConversationMemory[] {
  // Try FTS5 first
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2 && !FTS_STOP_WORDS.has(t));

  if (terms.length > 0) {
    try {
      const ftsQuery = terms.map(t => `"${t}"`).join(" OR ");
      const rows = stmtFtsSearchMemories.all(ftsQuery);
      if (rows.length > 0) {
        return rows.flatMap(row => {
          const mem = getMemory(row.memory_id);
          return mem ? [mem] : [];
        });
      }
    } catch {
      // FTS unavailable — fall through to LIKE
    }
  }

  // LIKE fallback
  const term = `%${query}%`;
  return stmtLikeSearchMemories.all(term, term, term).map(parseMemoryRow);
}

import { db } from "./connection.js";
import type { ConversationMemory } from "../types.js";

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
  stmtUpsertMemory.run({
    id: m.id,
    title: m.title,
    summary: m.summary,
    key_points: JSON.stringify(m.key_points),
    tags: JSON.stringify(m.tags),
    embedding: m.embedding ? JSON.stringify(m.embedding) : null,
    created_at: m.created_at,
  });
}

const stmtGetMemory = db.prepare(`
  SELECT * FROM memories WHERE id = ?
`);

export function getMemory(id: string): ConversationMemory | undefined {
  const row = stmtGetMemory.get(id) as any;
  if (!row) return undefined;
  return {
    ...row,
    key_points: JSON.parse(row.key_points),
    tags: JSON.parse(row.tags),
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  };
}

const stmtGetAllMemories = db.prepare(`
  SELECT * FROM memories ORDER BY created_at DESC
`);

export function getAllMemories(): ConversationMemory[] {
  return stmtGetAllMemories.all().map((row: any) => ({
    ...row,
    key_points: JSON.parse(row.key_points),
    tags: JSON.parse(row.tags),
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  }));
}

const stmtSearchMemories = db.prepare(`
  SELECT * FROM memories 
  WHERE title LIKE ? OR summary LIKE ? OR tags LIKE ?
  ORDER BY created_at DESC
`);

export function searchMemories(query: string): ConversationMemory[] {
  const term = `%${query}%`;
  return stmtSearchMemories.all(term, term, term).map((row: any) => ({
    ...row,
    key_points: JSON.parse(row.key_points),
    tags: JSON.parse(row.tags),
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  }));
}

import { db } from "./connection.js";
import type { SessionCapture } from "../types.js";

// ───── FTS5 helpers ───────────────────────────────────────────────────────────

const stmtFtsUpsert = db.prepare<[string, string, string]>(`
  INSERT OR REPLACE INTO sessions_fts(session_id, summary, tags)
  VALUES (?, ?, ?)
`);

const stmtFtsDelete = db.prepare<[string]>(`
  DELETE FROM sessions_fts WHERE session_id = ?
`);

function ftsUpsertSession(s: { id: string; summary: string; tags: string }): void {
  try {
    stmtFtsUpsert.run(s.id, s.summary, s.tags);
  } catch {
    // FTS table may not exist — safe to ignore
  }
}

function ftsDeleteSession(id: string): void {
  try {
    stmtFtsDelete.run(id);
  } catch {
    // FTS table may not exist — safe to ignore
  }
}

// ───── Shared row parser ──────────────────────────────────────────────────────

function parseSessionRow(row: any): SessionCapture {
  return {
    ...row,
    decisions: JSON.parse(row.decisions),
    patterns: JSON.parse(row.patterns),
    tags: JSON.parse(row.tags),
    next_context: row.next_context ?? "",
  };
}

// ───── Core CRUD ─────────────────────────────────────────────────────────────

const stmtUpsert = db.prepare(`
  INSERT INTO sessions (id, summary, decisions, patterns, next_context, tags, created_at)
  VALUES (@id, @summary, @decisions, @patterns, @next_context, @tags, @created_at)
  ON CONFLICT(id) DO UPDATE SET
    summary      = excluded.summary,
    decisions    = excluded.decisions,
    patterns     = excluded.patterns,
    next_context = excluded.next_context,
    tags         = excluded.tags
`);

export function upsertSession(s: SessionCapture): void {
  const tagsJson = JSON.stringify(s.tags);
  stmtUpsert.run({
    id: s.id,
    summary: s.summary,
    decisions: JSON.stringify(s.decisions),
    patterns: JSON.stringify(s.patterns),
    next_context: s.next_context,
    tags: tagsJson,
    created_at: s.created_at,
  });
  ftsUpsertSession({ id: s.id, summary: s.summary, tags: tagsJson });
}

const stmtGetById = db.prepare(`SELECT * FROM sessions WHERE id = ?`);

export function getSession(id: string): SessionCapture | undefined {
  const row = stmtGetById.get(id) as any;
  return row ? parseSessionRow(row) : undefined;
}

const stmtGetAll = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`);

export function getAllSessions(): SessionCapture[] {
  return stmtGetAll.all().map(parseSessionRow);
}

const stmtGetRecent = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?`);

export function getRecentSessions(limit: number): SessionCapture[] {
  return stmtGetRecent.all(limit).map(parseSessionRow);
}

const stmtCount = db.prepare<[], { c: number }>(`SELECT COUNT(*) as c FROM sessions`);

export function getSessionCount(): number {
  return (stmtCount.get() as { c: number }).c;
}

const stmtDelete = db.prepare<[string]>(`DELETE FROM sessions WHERE id = ?`);

export function deleteSession(id: string): boolean {
  ftsDeleteSession(id);
  const result = stmtDelete.run(id);
  return result.changes > 0;
}

// ───── Search (FTS5 with LIKE fallback) ──────────────────────────────────────

const FTS_STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "has", "have",
]);

const stmtFtsSearch = db.prepare<[string], { session_id: string }>(`
  SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT 10
`);

const stmtLikeSearch = db.prepare(`
  SELECT * FROM sessions
  WHERE summary LIKE ? OR tags LIKE ?
  ORDER BY created_at DESC
`);

export function searchSessions(query: string): SessionCapture[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2 && !FTS_STOP_WORDS.has(t));

  if (terms.length > 0) {
    try {
      const ftsQuery = terms.map(t => `"${t}"`).join(" OR ");
      const rows = stmtFtsSearch.all(ftsQuery);
      if (rows.length > 0) {
        return rows.flatMap(row => {
          const s = getSession(row.session_id);
          return s ? [s] : [];
        });
      }
    } catch {
      // FTS unavailable — fall through to LIKE
    }
  }

  const term = `%${query}%`;
  return stmtLikeSearch.all(term, term).map(parseSessionRow);
}

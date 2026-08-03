import Database, { type Database as DatabaseType } from "better-sqlite3";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { config } from "../config.js";

// Ensure the .tokenos directory exists in the target project
mkdirSync(dirname(config.dbPath), { recursive: true });

// Open or create the SQLite database at the per-project path
export const db: DatabaseType = new Database(config.dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Run schema migrations on startup
db.exec(`
  -- NODES TABLE
  CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    file_path   TEXT NOT NULL,

    summary     TEXT,
    code_snippet TEXT,
    embedding   TEXT,

    hash        TEXT,
    importance  REAL DEFAULT 0,

    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- EDGES TABLE
  CREATE TABLE IF NOT EXISTS edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node   TEXT NOT NULL,
    to_node     TEXT NOT NULL,
    type        TEXT NOT NULL,

    FOREIGN KEY(from_node) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(to_node)   REFERENCES nodes(id) ON DELETE CASCADE
  );

  -- MEMORIES TABLE (Phase 5)
  CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL,
    key_points  TEXT NOT NULL,   -- JSON array of strings
    tags        TEXT NOT NULL,   -- JSON array of strings
    embedding   TEXT,            -- JSON array of numbers
    created_at  INTEGER NOT NULL
  );

  -- INDEXES
  CREATE INDEX IF NOT EXISTS idx_nodes_name     ON nodes(name);
  CREATE INDEX IF NOT EXISTS idx_nodes_type     ON nodes(type);
  CREATE INDEX IF NOT EXISTS idx_nodes_file     ON nodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_nodes_importance ON nodes(importance);

  CREATE INDEX IF NOT EXISTS idx_edges_from     ON edges(from_node);
  CREATE INDEX IF NOT EXISTS idx_edges_to       ON edges(to_node);
  CREATE INDEX IF NOT EXISTS idx_edges_type     ON edges(type);
`);

// ── Safe migration: add meta column if not already present ────────────────────
try {
  db.exec(`ALTER TABLE nodes ADD COLUMN meta TEXT;`);
} catch {
  // Column already exists — ignore
}

// Unique edge constraint to prevent duplicates
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique ON edges(from_node, to_node, type);`);
} catch {
  // Already exists — ignore
}

// FTS5 full-text search index (non-content table — synced manually in upsertNode/deleteNodesByFile)
// Using non-content approach: no auto-sync issues, small storage overhead (text fields only)
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      node_id UNINDEXED,
      name,
      summary,
      meta
    );
  `);
} catch {
  // FTS5 not available or table already exists — ignore, text search still works
}

// FTS5 for memories — BM25-ranked search across title, summary, and tags
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      memory_id UNINDEXED,
      title,
      summary,
      tags
    );
  `);
} catch {
  // FTS5 not available or table already exists — ignore, LIKE fallback still works
}

// ── Phase 3: Sessions ─────────────────────────────────────────────────────────

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      summary      TEXT NOT NULL,
      decisions    TEXT NOT NULL,   -- JSON array
      patterns     TEXT NOT NULL,   -- JSON array
      next_context TEXT,
      tags         TEXT NOT NULL,   -- JSON array
      created_at   INTEGER NOT NULL
    );
  `);
} catch {
  // Already exists — ignore
}

try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_id UNINDEXED,
      summary,
      tags
    );
  `);
} catch {
  // FTS5 not available or table already exists — ignore
}

// ── Phase 4: Project Profiles ─────────────────────────────────────────────────

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_profiles (
      id                TEXT PRIMARY KEY,
      project_path      TEXT NOT NULL UNIQUE,
      summary           TEXT NOT NULL,
      decisions         TEXT NOT NULL,   -- JSON array
      patterns          TEXT NOT NULL,   -- JSON array
      current_state     TEXT,
      session_count     INTEGER DEFAULT 0,
      last_distilled_at INTEGER NOT NULL,
      created_at        INTEGER NOT NULL
    );
  `);
} catch {
  // Already exists — ignore
}


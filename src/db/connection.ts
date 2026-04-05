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

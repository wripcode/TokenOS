# TokenOS

[![npm version](https://img.shields.io/npm/v/tokenos.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/tokenos)
[![npm downloads](https://img.shields.io/npm/dm/tokenos.svg?style=flat-square)](https://www.npmjs.com/package/tokenos)
[![Node.js](https://img.shields.io/node/v/tokenos.svg?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/tokenos.svg?style=flat-square)](https://github.com/wripcode/tokenos/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?logo=sqlite&logoColor=white&style=flat-square)](https://sqlite.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-brightgreen?style=flat-square)](https://modelcontextprotocol.io)

> **Local-first codebase graph intelligence for AI assistants — powered by SQLite, ts-morph, and optional Ollama.**

`TokenOS` is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that statically analyses your TypeScript/TSX codebase, stores it as a structural dependency graph in SQLite, enriches nodes with **BM25 full-text search via SQLite FTS5**, optionally adds semantic embeddings via Ollama, and exposes high-precision query tools for AI coding assistants like Claude, Cursor, or any MCP-compatible client.

**The goal**: When you start a new chat, the AI already knows your codebase structure. No more "let me analyze all files first" — it queries the graph and gets exactly what it needs, saving tokens and compute.

> **Works fully offline.** FTS5 full-text search is built into SQLite — no Ollama, no internet, no external services required. Ollama adds optional semantic (concept-level) search on top.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Commands](#commands)
- [Database Location](#database-location)
- [MCP Client Configuration](#mcp-client-configuration)
- [MCP Tools](#mcp-tools)
- [Node Types](#node-types)
- [Edge Types](#edge-types)
- [Importance Scoring](#importance-scoring)
- [Semantic Meta Enrichment](#semantic-meta-enrichment)
- [Conversation Memory](#conversation-memory)
- [Visualization Dashboard](#visualization-dashboard)
- [Changing the Embedding Model](#changing-the-embedding-model)
- [Architecture](#architecture)
- [Configuration Reference](#configuration-reference)
- [Prerequisites](#prerequisites)
- [Tech Stack](#tech-stack)
- [Limitations](#limitations)
- [License](#license)

---

## Quick Start

Run TokenOS on any codebase instantly via `npx`. No installation, setup, or config files required!

```bash
# In your project folder
npx -y tokenos .

# Or for a specific path
npx -y tokenos /absolute/path/to/project
```

That's it. The server will:

1. Parse all `.ts`/`.tsx` files via ts-morph AST analysis
2. Extract nodes (functions, classes, components, interfaces, types, enums, routes, variables, imports)
3. Extract edges (CALLS, IMPORTS, EXPORTS, EXTENDS, IMPLEMENTS, DEFINES, RENDERS, CONTAINS, TYPE_OF, PART_OF_TAB)
4. Store everything in a per-project SQLite database
5. Auto-generate summaries for all nodes
6. Back-fill semantic embeddings via Ollama (if running)
7. Compute importance scores for architectural ranking
8. Start a chokidar file watcher for real-time incremental updates
9. Serve 6 MCP tools over stdio transport
10. Optionally launch an interactive graph visualization dashboard

---

## Commands

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `npx -y tokenos .`      | Index the current folder and start the MCP server    |
| `npx -y tokenos /path`  | Index a specific folder and start the server         |
| `npx tokenos --version` | Print the installed version                          |
| `npm run dev`           | _(Cloned repo only)_ Start in local development mode |
| `npm run reset`         | _(Cloned repo only)_ Wipe the development database   |

---

## Database Location

Each project gets its own isolated database at:

```
<your-project>/.tokenos/graph.db
```

This means:

- ✅ Different projects never mix data
- ✅ You can delete `.tokenos/` to reset a specific project
- ✅ Add `.tokenos/` to your project's `.gitignore`

SQLite is configured with **WAL mode** for better concurrent read performance and foreign key enforcement.

### Schema

Three tables and one virtual table are created automatically:

| Table       | Purpose                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodes`     | All code entities (functions, classes, components, etc.) with metadata, summaries, embeddings, and importance scores                           |
| `edges`     | All relationships between nodes (CALLS, IMPORTS, RENDERS, etc.) with unique constraint on `(from_node, to_node, type)`                         |
| `memories`  | Conversation memory storage for persistent context across sessions                                                                             |
| `nodes_fts` | FTS5 virtual table — BM25 full-text index over `name`, `summary`, and `meta` fields. Kept in sync with `nodes` inside every index transaction. |

---

## MCP Client Configuration

You can add multiple entries — one for each project you want AI access to. They do not conflict, as each creates an isolated database inside its respective project folder.

### Antigravity IDE

Open `~/.gemini/antigravity/mcp_config.json` and add your projects under `mcpServers`:

```json
{
  "mcpServers": {
    "tokenos-myapp": {
      "command": "npx",
      "args": ["-y", "tokenos", "/absolute/path/to/myapp"],
      "env": {}
    }
  }
}
```

### Claude Code

Open `~/.claude.json` and add underneath `"mcpServers"`:

```json
"tokenos-myapp": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "tokenos", "/absolute/path/to/myapp"],
  "env": {}
}
```

### Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "tokenos-myapp": {
      "command": "npx",
      "args": ["-y", "tokenos", "/absolute/path/to/myapp"]
    }
  }
}
```

---

## MCP Tools

All tools are **read-only**, **idempotent**, and communicate over **stdio** transport. Responses are truncated at **25,000 characters** to prevent overwhelming the LLM context window.

### `search`

Smart search that understands intent and returns the most relevant code and context.

```
Args:
  query           (string)  — Natural language question or search term
  response_format (optional) — 'json' (default) or 'markdown'
```

**How it works:**

1. **Intent detection** — Classifies query into one of four modes:
   - `semantic` (default) — general concept/code search
   - `trace` — triggered by "trace", "flow", "how", "why" → deeper BFS traversal (depth 2)
   - `explore` — triggered by "where", "what", "find" → broad shallow search
   - `dependency` — triggered by "depend", "import", "export" → import/export edges only
2. **Hybrid search** — Tries FTS5 BM25 first, then Ollama semantic similarity if available, then multi-term text fallback
3. **Graph expansion** — BFS-expands top results into a contextualized subgraph
4. **Memory retrieval** — Appends relevant conversation memories (top 3)

**Response includes `semantic_available: true/false`** so you always know which search layer was used.

**Without Ollama:** FTS5 handles all queries automatically. Searches like `"attribute listing display"` correctly return attribute-related nodes via BM25 term matching — no stale results.

**Returns:** Compressed, relevant context (code + relationships + memory)

### `find_nodes`

Find code elements by name, type, or meaning.

```
Args:
  query           (string)  — Function name, class name, or natural-language description
  type            (optional) — 'function' | 'class' | 'file' | 'import' | 'variable' | 'component' | 'interface' | 'type_alias' | 'enum' | 'route'
  mode            (optional) — 'text' (default) or 'semantic' (requires Ollama)
  limit           (optional) — 1–50, default 10
  offset          (optional) — for pagination
  response_format (optional) — 'json' (default) or 'markdown'
```

**Text mode**: Uses FTS5 BM25 ranking for multi-word queries, falling back to LIKE matching for single-word exact searches. Matches across `name`, `summary`, and `meta` fields. When `type` is provided, results are filtered with AND logic.

**Semantic mode**: Uses Ollama embeddings for concept-level search. Example: searching `"authentication handler"` finds `loginUser()` even if "auth" isn't in the name.

**Without Ollama (semantic mode fallback)**: Automatically falls back to FTS5 → multi-term → single-term chain — no error, no empty results.

**Response includes `semantic_available: true/false`** in semantic mode so you know if Ollama was actually used.

**Returns:** List of matching nodes with relevance ranking

### `get_node`

Get full details of a specific code element.

```
Args:
  id              (string)  — format: 'filePath::name' (e.g. 'src/utils/cache.ts::LRUCache')
  response_format (optional) — 'json' or 'markdown'
```

**Returns:** Complete node data (code, type, file, importance)

### `get_connections`

Get directly related code elements.

```
Args:
  id              (string)  — Node ID
  include_reverse (optional) — true/false, default false. Include nodes that USE this node.
  limit           (optional) — 1–100, default 50
  response_format (optional) — 'json' or 'markdown'
```

**Returns:** Connected nodes and their relationships. When `include_reverse` is true, also includes `used_by` array.

### `explore`

Explore surrounding code context from a starting point.

```
Args:
  id              (string)  — Starting node ID
  depth           (optional) — 1–3, default 2
  include_imports (optional) — true/false, default true. Set false to hide import nodes.
```

**Returns:** Local graph (nodes + relationships)

### `top_nodes`

Get the most important parts of the codebase.

```
Args:
  limit           (optional) — 1–100, default 20
  response_format (optional) — 'json' or 'markdown'
```

**Returns:** Ranked list of high-impact nodes

### `status`

Get TokenOS system status, statistics, and available capabilities.

```
Args: (none)
```

**Returns:** System stats (node counts, edge counts, FTS index size) and capability flags (text_search, fts5, semantic_search, graph_traversal, reverse_edges).

---

## Node Types

The parser extracts **10 distinct node types** from TypeScript/TSX source files:

| Type         | Description                         | Detection Method                                                          |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `function`   | Named functions and arrow functions | `FunctionDeclaration` and `VariableDeclaration → ArrowFunction`           |
| `component`  | React/JSX components                | PascalCase function that contains JSX elements                            |
| `class`      | ES6 class declarations              | `ClassDeclaration`                                                        |
| `interface`  | TypeScript interface declarations   | `InterfaceDeclaration`                                                    |
| `type_alias` | TypeScript type aliases             | `TypeAliasDeclaration`                                                    |
| `enum`       | TypeScript enum declarations        | `EnumDeclaration`                                                         |
| `variable`   | Exported constants and variables    | Exported `VariableStatement` (excluding arrow functions already captured) |
| `import`     | Import declarations                 | `ImportDeclaration` → keyed as `import:<module_specifier>`                |
| `file`       | Source file entry                   | One per file, named after the basename                                    |
| `route`      | Next.js App Router route            | Detected from `app/**/page.tsx` file paths                                |

---

## Edge Types

The parser extracts **10 distinct edge types** representing relationships between nodes:

| Edge          | Description                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------- |
| `CALLS`       | Function A calls function B (via `CallExpression`)                                          |
| `IMPORTS`     | File imports a module                                                                       |
| `EXPORTS`     | File exports a symbol                                                                       |
| `EXTENDS`     | Class or interface extends a base                                                           |
| `IMPLEMENTS`  | Class implements an interface                                                               |
| `DEFINES`     | File defines a symbol (function, class, variable, etc.)                                     |
| `RENDERS`     | React component renders another component (JSX usage)                                       |
| `CONTAINS`    | Wrapper component contains a child in JSX tree (direct parent-child)                        |
| `TYPE_OF`     | Symbol references a type or interface                                                       |
| `PART_OF_TAB` | Component belongs to a tab (detected from `TabsContent`, `TabContent`, `TabPanel` wrappers) |

---

## Importance Scoring

Every node is scored using a batch SQL computation:

```
Score = (inDegree × 2) + outDegree + typeWeight
```

| Type         | Weight |
| ------------ | ------ |
| `class`      | 3.0    |
| `component`  | 2.5    |
| `function`   | 2.0    |
| `route`      | 1.5    |
| `interface`  | 1.5    |
| `enum`       | 1.5    |
| `file`       | 1.5    |
| `type_alias` | 1.0    |
| `variable`   | 1.0    |
| `import`     | 0.5    |

Importance is computed in a single aggregation query (no N+1), then batch-updated in a transaction.

---

## Semantic Meta Enrichment

The parser automatically infers rich metadata for each node:

### UI Role Detection

Components are assigned a UI `role` based on name/file pattern matching:

| Pattern               | Role         |
| --------------------- | ------------ |
| `*panel*`             | `panel`      |
| `*tab*`               | `tab`        |
| `*page*`              | `page`       |
| `*dialog*`, `*modal*` | `dialog`     |
| `*form*`              | `form`       |
| `*sidebar*`, `*nav*`  | `navigation` |
| `*header*`            | `header`     |
| `*footer*`            | `footer`     |
| `*content*`           | `content`    |
| `*list*`              | `list`       |
| `*card*`              | `card`       |
| `*button*`            | `action`     |
| `*layout*`            | `layout`     |

### Feature Inference

Features are extracted from directory structure:

- **Next.js App Router**: `app/(group)/feature-name/...` → `feature: "feature-name"`
- **Component directories**: `components/feature-name/...` → `feature: "feature-name"`

### Route Detection

Next.js App Router routes are auto-detected from `app/**/page.tsx` paths and stored as `route` nodes.

### Tab System Detection

When the parser encounters `<TabsContent value="xxx">` (or `TabContent`, `TabPanel`), it:

1. Creates `PART_OF_TAB` edges from children to the parent component
2. Sets `meta.tab = "xxx"` on the child nodes

### Enriched Meta Search

All meta fields (role, tab, feature) are queryable via the `searchNodesExtended` function, which combines name LIKE matching with JSON meta extraction in a single SQL query.

---

## Conversation Memory

TokenOS includes a persistent memory system for storing conversation context across sessions:

- **Storage**: SQLite `memories` table with title, summary, key_points (JSON array), tags (JSON array), and optional embeddings
- **Auto-indexing**: Markdown files in `/memory/` or `/memories/` directories within the watched project are automatically parsed and stored
- **Extraction**: Titles from `# headings`, tags from `tags: [...]` patterns, key points from bullet lists
- **Search**: Text-based search across title, summary, and tags
- **Integration**: Memories are automatically surfaced in `search` results

---

## Visualization Dashboard

Enable the built-in visualization UI by setting `ui.enabled: true` in your config or passing the `--ui` CLI flag.

### Routes

| Route             | Description                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/`               | **Dashboard** — Glassmorphism-styled overview with stats cards, top nodes grid, and full context explorer table. Animated with GSAP. |
| `/graph`          | **Network Graph** — Interactive force-directed graph visualization using vis-network. Click nodes for details.                       |
| `/api/stats`      | JSON API: node counts by type + top 50 nodes                                                                                         |
| `/api/graph-data` | JSON API: full graph data (auto-limited to top 1500 nodes for browser performance)                                                   |

---

## Changing the Embedding Model

Edit `tokenos.config.json`:

```json
{
  "ollama": {
    "model": "mxbai-embed-large:latest"
  }
}
```

Then reset and re-index (different models produce incompatible vectors):

```bash
npm run reset
npm run dev
```

Popular models:

- `mxbai-embed-large:latest` — high quality, larger context
- `nomic-embed-text` — fast, good general purpose (default fallback)
- `all-minilm` — lightweight, fast

### Embedding Pipeline Details

- **Input enrichment**: Embeddings are generated from a structured prompt that includes `[NAME]`, `[TYPE]`, `[ROLE]`, `[TAB]`, `[FEATURE]`, `[ROUTE]`, `[SUMMARY]`, and `[CODE]` (first 300 chars) tags. This produces richer vectors than embedding raw code alone.
- **LRU caching**: An in-memory LRU cache (1000 entries, 30min TTL) prevents redundant Ollama calls for unchanged text.
- **Backfill strategy**: On boot, only nodes _without_ existing embeddings are processed. If Ollama becomes unavailable mid-backfill, the process stops gracefully.
- **Health checks**: Ollama availability is probed once via `/api/tags` with a 2-second timeout. Subsequent failures reset the health flag for retry on next request.

---

## Architecture

```
src/
├── main.ts                 # Entry point — validates config, bootstraps all systems, graceful shutdown
├── config.ts               # Config loader (CLI args → config file → env vars → defaults)
├── reset.ts                # Reset script — deletes project DB + WAL/SHM files
├── verify-parser.ts        # Parser verification — validates node types, edge types, and meta
├── types.ts                # Shared TypeScript types (10 NodeTypes, 10 EdgeTypes, ConversationMemory)
│
├── db/
│   ├── connection.ts       # SQLite connection + schema (WAL mode, foreign keys, 3 tables, 7 indexes)
│   ├── queries.ts          # 20+ prepared statements (upsert, search, batch importance, meta queries)
│   ├── memory.ts           # Conversation memory CRUD (upsert, search, get all)
│   └── index.ts            # Re-exports
│
├── indexer/
│   ├── parser.ts           # ts-morph AST parser — extracts 10 node types, 10 edge types, semantic meta
│   ├── indexer.ts          # Orchestrates parse → hash-skip → transaction (delete stale + upsert fresh)
│   ├── watcher.ts          # chokidar file watcher (incremental: add/change/unlink, ignoreInitial)
│   ├── ignore.ts           # .gitignore rule loader + hardcoded ignores (node_modules, .git, dist, etc.)
│   └── cli.ts              # One-shot CLI indexer (npm run index)
│
├── embeddings/
│   ├── client.ts           # Ollama HTTP client + enriched embedding input builder + LRU cache
│   ├── similarity.ts       # Cosine similarity + ranked search (top-K)
│   └── index.ts            # backfillEmbeddings() + re-exports
│
├── server/
│   ├── server.ts           # MCP server — registers 6 tools, BFS subgraph builder, node/edge compression
│   ├── visualize.ts        # Optional visualization dashboard (HTTP server, vis-network + GSAP)
│   └── index.ts            # Re-exports
│
└── utils/
    ├── scoring.ts           # Importance score computation (delegates to batch SQL)
    ├── logger.ts            # Vite-inspired colored logger (picocolors, per-module tags)
    └── cache.ts             # Generic LRU cache with TTL (used by embedding client)
```

### Boot Sequence

```
1. Validate config (watchPath exists)
2. Optionally start visualization UI server
3. Full directory indexing (recursive walk, .gitignore-aware)
4. Probe Ollama → backfill embeddings for un-embedded nodes
5. Batch-compute importance scores (single SQL aggregation)
6. Start chokidar watcher (incremental updates only)
7. Start MCP stdio server (blocks until client disconnects)
8. Print Vite-like status banner with health checks
9. Register SIGINT/SIGTERM handlers for graceful shutdown
```

### Incremental Update Strategy

- **Hash-based skip**: Each file's content is SHA-256 hashed (truncated to 16 chars). Files with unchanged hashes are skipped entirely.
- **Transactional upsert**: On file change, a single SQLite transaction deletes all stale nodes/edges for the file then inserts fresh data, ensuring FK consistency.
- **Graceful FK handling**: Edges referencing nodes in un-indexed files are silently skipped (they'll be wired up when the target file is indexed).

---

## Configuration Reference

### `tokenos.config.json`

| Field          | Type      | Default                  | Description                                    |
| -------------- | --------- | ------------------------ | ---------------------------------------------- |
| `watchPath`    | `string`  | `process.cwd()`          | Absolute path to the project you want to index |
| `ollama.url`   | `string`  | `http://localhost:11434` | Ollama server URL                              |
| `ollama.model` | `string`  | `nomic-embed-text`       | Embedding model to use                         |
| `ui.enabled`   | `boolean` | `false`                  | Start visualization dashboard on boot          |
| `ui.port`      | `number`  | `3333`                   | Dashboard HTTP server port                     |

### Environment Variable Overrides

| Variable          | Overrides      |
| ----------------- | -------------- |
| `OLLAMA_URL`      | `ollama.url`   |
| `EMBEDDING_MODEL` | `ollama.model` |
| `GRAPH_UI_PORT`   | `ui.port`      |

### CLI Arguments

| Argument           | Description                                        |
| ------------------ | -------------------------------------------------- |
| First non-flag arg | Overrides `watchPath`                              |
| `--ui`             | Enables visualization dashboard (overrides config) |

**Precedence**: CLI args → config file → environment variables → defaults

---

## Prerequisites

| Dependency                                | Purpose                       |
| ----------------------------------------- | ----------------------------- |
| Node.js ≥ 18                              | Runtime                       |
| `npm`                                     | Package manager               |
| [Ollama](https://ollama.ai/) _(optional)_ | Semantic embedding generation |

If Ollama is not running, the server starts normally — semantic search falls back to text-mode and embeddings are skipped.

---

## Tech Stack

**Core Technologies:**

- **[TypeScript](https://www.typescriptlang.org/) / [Node.js](https://nodejs.org/)** — Core language and runtime (ES2022 target, Node16 module resolution)
- **[SQLite](https://sqlite.org/)** — Local, fast, embedded graph database (WAL mode)
- **[ts-morph](https://ts-morph.com/)** — TypeScript AST parsing tool for static analysis
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** — Standardized AI tool integration protocol
- **[Ollama](https://ollama.com/)** — Local semantic vector embeddings _(optional)_

### Dependencies

| Package                     | Version | Role                                  |
| --------------------------- | ------- | ------------------------------------- |
| `@modelcontextprotocol/sdk` | ^1.8.0  | MCP server + stdio transport          |
| `better-sqlite3`            | ^11.9.1 | Synchronous SQLite (Node.js)          |
| `ts-morph`                  | ^25.0.1 | TypeScript AST parsing                |
| `chokidar`                  | ^4.0.3  | File watching                         |
| `ignore`                    | ^7.0.5  | `.gitignore`-pattern matching         |
| `zod`                       | ^4.3.6  | Schema validation for MCP tool inputs |
| `picocolors`                | ^1.1.1  | Terminal colors                       |

### Dev Dependencies

| Package                 | Version   | Role                     |
| ----------------------- | --------- | ------------------------ |
| `@types/better-sqlite3` | ^7.6.12   | SQLite type definitions  |
| `@types/node`           | ^22.13.13 | Node.js type definitions |
| `tsx`                   | ^4.19.3   | TypeScript dev runner    |
| `typescript`            | ^5.8.2    | TypeScript compiler      |

---

## Limitations

- Only `.ts` and `.tsx` files are indexed (no `.js`, `.jsx`, `.vue`, etc.)
- The graph database is rebuilt on first run per project (or when you run `tokenos reset`)
- Subgraph BFS and search responses are truncated at 25,000 characters
- Cross-file edges to un-indexed targets are gracefully skipped (resolved when the dependency is indexed later)
- Memory file extraction uses basic regex parsing (headings, bullet points, tag patterns)
- Visualization dashboard loads at most 1,500 nodes to prevent browser rendering issues
- Semantic (concept-level) search requires Ollama — all other search modes (FTS5, text) work fully offline

---

## License

MIT

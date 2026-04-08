# How to Use TokenOS — Token-Saving Guide

> **Problem**: Every new AI chat session analyzes your entire codebase from scratch — reading dozens of files, burning thousands of tokens, and wasting compute before any real work begins.
>
> **Solution**: TokenOS pre-indexes your codebase into a structured graph. The AI queries the graph to get exactly the context it needs in 1–2 tool calls instead of scanning every file.

> **Works fully offline.** FTS5 full-text search is built into SQLite (zero external dependencies). Ollama is optional — it adds concept-level semantic search on top of FTS5, but is never required.

---

## Table of Contents

1. [Setup (One-Time)](#1-setup-one-time)
2. [How It Saves Tokens](#2-how-it-saves-tokens)
3. [Real-World Workflows](#3-real-world-workflows)
4. [Tool-by-Tool Usage Guide](#4-tool-by-tool-usage-guide)
5. [Tips for Maximum Token Savings](#5-tips-for-maximum-token-savings)
6. [Adding to Your Project](#6-adding-to-your-project)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Setup (One-Time)

### Step 1: Configure your project path

Edit `tokenos.config.json` in the TokenOS directory:

```json
{
  "watchPath": "/Users/wripcode_/Desktop/myLab/swiss-knife-flow",
  "ollama": {
    "url": "http://localhost:11434",
    "model": "mxbai-embed-large:latest"
  }
}
```

### Step 2: Start the server

```bash
cd /path/to/TokenOS
npm run dev
```

The server indexes your codebase once, then watches for changes. It stays running in the background.

### Step 3: Connect your AI client

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "tokenos": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/TokenOS/src/main.ts"]
    }
  }
}
```

**That's it.** The AI now has access to 6 query tools instead of scanning files.

---

## 2. How It Saves Tokens

### Without TokenOS (the old way)

```
You: "Add a new auth middleware to swiss-knife-flow"

AI: Let me understand your codebase...
  → list_dir src/ (50 files)
  → view_file src/app/layout.tsx
  → view_file src/middleware.ts
  → view_file src/lib/auth.ts
  → view_file src/app/api/auth/route.ts
  → view_file src/components/auth-provider.tsx
  → view_file src/types/auth.ts
  → grep_search "middleware" (30 results)
  → view_file ... (3 more files)
  
Total: ~10-15 tool calls, ~8,000-15,000 tokens just to understand the codebase
```

### With TokenOS (the new way)

```
You: "Add a new auth middleware to swiss-knife-flow"

AI: Let me find the relevant code...
  → find_nodes { query: "auth middleware", mode: "semantic" }
  → get_connections { id: "src/middleware.ts::middleware" }
  
Total: 2 tool calls, ~500-1,000 tokens to understand the relevant parts
```

**Result: 80-95% token reduction for codebase understanding.**

---

## 3. Real-World Workflows

### Scenario 1: Implementing a New Function

> *"I want to add a `validateWebhook()` function to my swiss-knife-flow project"*

**What the AI should do:**

1. **Find related code** (1 tool call):
   ```
   find_nodes { query: "webhook validate", mode: "semantic" }
   ```
   → Returns existing webhook-related functions, their file paths, and importance scores.

2. **Understand the context** (1 tool call):
   ```
   get_connections { id: "src/lib/webhooks.ts::processWebhook" }
   ```
   → Shows what calls `processWebhook`, what it imports, and related types.

3. **Now implement** — The AI knows exactly where to put the new function and what patterns to follow, without reading every file.

**Tokens saved**: ~5,000–10,000

---

### Scenario 2: Debugging an Issue

> *"The login flow is broken after the last refactor"*

**What the AI should do:**

1. **Find the entry point** (1 tool call):
   ```
   find_nodes { query: "login", type: "function" }
   ```

2. **Trace the call graph** (1 tool call):
   ```
   explore { id: "src/app/api/auth/login/route.ts::POST", depth: 2 }
   ```
   → Shows the full call chain: route → auth service → database → response.

3. **Read only the relevant files** — Now the AI reads 2–3 specific files instead of scanning 50.

---

### Scenario 3: Understanding Unfamiliar Code

> *"What are the most important parts of this codebase?"*

**What the AI should do:**

1. **Get the architecture overview** (1 tool call):
   ```
   top_nodes { limit: 15 }
   ```
   → Returns the 15 most connected/important nodes — the backbone of your app.

2. **Drill into specific areas** as needed:
   ```
   get_connections { id: "src/lib/api-client.ts::ApiClient" }
   ```

---

### Scenario 4: Adding a Feature That Touches Multiple Files

> *"Add dark mode support to the dashboard"*

**What the AI should do:**

1. **Find all UI-related code** (1 tool call):
   ```
   find_nodes { query: "theme color style", mode: "semantic", type: "variable" }
   ```

2. **Find the component tree** (1 tool call):
   ```
   find_nodes { query: "dashboard", type: "function" }
   ```

3. **Trace dependencies** (1 tool call per key component):
   ```
   get_connections { id: "src/components/dashboard/layout.tsx::DashboardLayout" }
   ```

---

### Scenario 5: Refactoring

> *"Rename the `fetchSites` function and update all callers"*

**What the AI should do:**

1. **Find the function** (1 tool call):
   ```
   find_nodes { query: "fetchSites", type: "function" }
   ```

2. **Find all callers** (1 tool call):
   ```
   get_connections { id: "src/lib/webflow.ts::fetchSites" }
   ```
   → Shows every file that CALLS this function — no grep needed.

---

## 4. Tool-by-Tool Usage Guide

### `top_nodes` — Start Here

**When**: Beginning of any new conversation about the codebase.

```
top_nodes { limit: 20, response_format: "markdown" }
```

Returns the most architecturally significant nodes. This gives the AI a mental map of your project in one call. **Always start here.**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 20 | How many nodes (1–100) |
| `response_format` | json | `json` or `markdown` |

---

### `find_nodes` — Find Relevant Code

**When**: Looking for specific functions, classes, or concepts.

**Text mode** (fast, works offline — no Ollama needed):
```
find_nodes { query: "auth", type: "function" }
```
For single-word queries: LIKE match on name, summary, and meta fields.

For multi-word queries: FTS5 BM25 ranking — `"sidebar collapse toggle"` correctly finds sidebar-related nodes even if no single node name contains all three words.

**Semantic mode** (concept-based, requires Ollama):
```
find_nodes { query: "user authentication handler", mode: "semantic" }
```
Finds code related to the concept even if the name doesn't match. E.g., `loginUser()` matches `"authentication handler"`.

**Without Ollama (semantic mode fallback):**
```
find_nodes { query: "user authentication handler", mode: "semantic" }
```
Automatically falls back to FTS5 → multi-term → single-term — no error thrown, no empty results. Response includes `semantic_available: false` so you know Ollama wasn't used.

| Param | Default | Description |
|-------|---------|-------------|
| `query` | required | Search term or description |
| `type` | all | `function`, `class`, `component`, `interface`, `type_alias`, `enum`, `route`, `file`, `variable` |
| `mode` | text | `text` or `semantic` |
| `limit` | 10 | Results per page (1–50) |
| `offset` | 0 | For pagination |

---

### `get_node` — Full Details

**When**: You have a node ID and want the complete picture (code snippet, importance, etc.).

```
get_node { id: "src/lib/auth.ts::validateToken" }
```

Returns: name, type, file path, code snippet (first 12 lines), importance score.

---

### `get_connections` — What's Connected?

**When**: Understanding what a function calls, what calls it, and what it imports.

```
get_connections { id: "src/lib/auth.ts::validateToken", include_reverse: true }
```

Returns:
- **Edges**: `CALLS`, `IMPORTS`, `EXPORTS`, `EXTENDS`, `DEFINES`
- **Connected nodes**: sorted by importance (limit default 50)
- **Used by**: nodes that use/call this node (when `include_reverse: true`)

This is the key tool for understanding how code fits together without reading entire files.

---

### `explore` — Full Context Tree

**When**: You need the complete call/dependency tree around a node.

```
explore { id: "src/app/api/route.ts::handler", depth: 2 }
```

Returns a BFS traversal — all nodes and edges reachable within `depth` hops. Use `depth: 1` for large codebases to keep responses small.

| Param | Default | Description |
|-------|---------|-------------|
| `id` | required | Starting node |
| `depth` | 2 | 1–3 hops |
| `include_imports` | true | Set false to hide import nodes for a cleaner structural graph |

---

### `search` — Smart Search

**When**: You want the AI to automatically figure out the best search strategy.

```
search { query: "how does the auth flow work?", response_format: "markdown" }
```

Automatically detects intent, runs hybrid search (FTS5 → Ollama → fallback), expands the graph, and includes relevant memories.

Response always includes `semantic_available: true/false` — `false` means FTS5/text search was used (Ollama offline or not configured). Results are still accurate either way.

---

## 5. Tips for Maximum Token Savings

### DO ✅

- **Start every new chat with `top_nodes`** — gives the AI instant context
- **Use `type` filters** — `find_nodes { query: "auth", type: "function" }` returns only functions, not imports
- **Use semantic mode for vague queries** — `"error handling"` finds `catchApiError()`, `handleException()`, etc. Without Ollama, FTS5 handles this automatically
- **Check `semantic_available` in responses** — `false` means Ollama was offline; FTS5 results are still accurate but not concept-aware
- **Use `response_format: "markdown"`** — more compact for AI consumption

### DON'T ❌

- **Don't let the AI `list_dir` and `view_file` to "understand the codebase"** — TokenOS already has this information
- **Don't use `depth: 3` on `explore`** — the response can be huge. Start with `depth: 1`
- **Don't search without filters** — `find_nodes { query: "a" }` returns too many results
- **Don't re-index manually** — the file watcher handles changes automatically

### Pro Tips 💡

1. **Node IDs are `filePath::name`** — e.g., `src/lib/auth.ts::validateToken`. You can construct these from file paths you already know.

2. **Importance score tells priority** — Higher score = more central to the architecture. Focus on high-importance nodes first.

3. **Semantic search finds concepts** — If you're looking for "the function that handles form submissions" but don't know its name, semantic mode will find it.

4. **The graph updates in real-time** — When you save a file, the watcher re-indexes it. Next query will have the latest data.

5. **Combine tools in sequence**:
   ```
   1. top_nodes { limit: 10 }                       → overview
   2. find_nodes { query: "..." }                    → find specific code
   3. get_connections { id: "..." }                   → understand connections
   4. view_file (only the specific file you need)    → read actual code
   ```

---

## 6. Adding to Your Project

### Add `.tokenos/` to your project's `.gitignore`:

```bash
echo ".tokenos/" >> /path/to/your/project/.gitignore
```

This prevents the per-project database from being committed.

### Switching Between Projects

Edit `tokenos.config.json` and change `watchPath`:

```json
{
  "watchPath": "/path/to/different/project"
}
```

Then restart: `npm run dev`. Or if you want a fresh index:

```bash
npm run reset
npm run dev
```

### Changing the Embedding Model

Edit `tokenos.config.json`:

```json
{
  "ollama": {
    "model": "nomic-embed-text"
  }
}
```

**Important**: After changing models, run `npm run reset` then `npm run dev` — different models produce incompatible vectors.

---

## 7. Troubleshooting

### "0 files indexed"

- Check that `watchPath` points to a directory containing `.ts` or `.tsx` files
- Check that the path exists and is accessible
- Check `.gitignore` — files matching gitignore patterns are skipped

### "Embeddings skipped (Ollama offline)"

- Start Ollama: `ollama serve`
- Pull the model: `ollama pull mxbai-embed-large:latest`
- **This is fine.** FTS5 handles all text and intent queries automatically without Ollama. Only concept-level semantic search (e.g. finding `loginUser` when searching `"authentication handler"`) requires Ollama.

### "search returns unrelated results" or "find_nodes returns 0"

- **If upgrading from v1.1.x:** Run `tokenos reset` (or delete `<your-project>/.tokenos/graph.db`) then restart. The FTS5 index is built on first index run — existing databases don't have it until reset.
- After reset, re-index: restart the MCP server (it indexes on boot) or run `npm run dev`.

### Stale data after refactoring

```bash
npm run reset    # delete the database
npm run dev      # re-index from scratch
```

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────┐
│                    TOKENOS CHEAT SHEET                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  START HERE:                                                 │
│  top_nodes { limit: 15 }                                     │
│                                                              │
│  FIND CODE:                                                  │
│  find_nodes { query: "auth", type: "function" }              │
│  find_nodes { query: "handles login", mode: "semantic" }     │
│                                                              │
│  UNDERSTAND CONNECTIONS:                                     │
│  get_connections { id: "file::name", include_reverse: true } │
│                                                              │
│  EXPLORE CONTEXT:                                            │
│  explore { id: "file::name", depth: 1, include_imports: false}
│                                                              │
│  CHECK SYSTEM:                                               │
│  status {}                                                   │
│                                                              │
│  FULL NODE DETAILS:                                          │
│  get_node { id: "file::name" }                               │
│                                                              │
│  SMART SEARCH:                                               │
│  search { query: "how does auth work?" }                     │
│                                                              │
│  COMMANDS:                                                   │
│  npm run dev     → start server                              │
│  npm run reset   → delete DB & re-index                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

# TokenOS

[![npm version](https://img.shields.io/npm/v/tokenos.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/tokenos)
[![npm downloads](https://img.shields.io/npm/dm/tokenos.svg?style=flat-square)](https://www.npmjs.com/package/tokenos)
[![Node.js](https://img.shields.io/node/v/tokenos.svg?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/tokenos.svg?style=flat-square)](https://github.com/wripcode/tokenos/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?logo=sqlite&logoColor=white&style=flat-square)](https://sqlite.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-brightgreen?style=flat-square)](https://modelcontextprotocol.io)

> **Local-first codebase graph intelligence for AI assistants — powered by SQLite, ts-morph, and optional Ollama.**

`TokenOS` is a Model Context Protocol (MCP) server that instantly gives your AI coding assistant (like Claude, Cursor, or Antigravity) deep, structured knowledge of your codebase.

Instead of the AI blindly guessing your architecture or you manually attaching files, TokenOS indexes your project into a fast, local SQLite database and provides the AI with high-precision search tools.

---

## ⚡ Quick Start

Run TokenOS on any codebase instantly. **No installation or configuration required.**

```bash
# In your project folder, run:
npx tokenos .
```

**What happens next?**

1. TokenOS analyzes your code and creates a lightweight, local database inside `.tokenos/`.
2. A file watcher starts, keeping the index perfectly in sync as you code.
3. If this is your first time running TokenOS, it will prompt you to automatically connect it to your IDE.

Press `Y`, restart your IDE, and you're done! Your AI assistant now deeply understands your codebase.

---

## 🤖 How the AI Uses TokenOS

Once connected, your AI assistant will automatically use these tools whenever it needs context:

| Tool              | What it does                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `search`          | Smart natural-language search across your codebase (powered by local FTS5, plus Ollama if available). |
| `find_nodes`      | Locates specific functions, classes, components, or files.                                            |
| `get_node`        | Reads the full code and details of a specific element.                                                |
| `get_connections` | Finds what a function calls, or what calls a function (dependency graph).                             |
| `explore`         | Navigates the surrounding architecture from a starting point.                                         |
| `top_nodes`       | Identifies the most structurally important files and functions in your project.                       |

---

## 🧠 Conversation Memory

TokenOS includes a persistent memory system for storing conversation context across sessions. Your AI can remember your architectural decisions and rules.

- **Direct Memory Writing**: The AI can save rules and context directly during a conversation using the `save_memory` tool.
- **Smart Retrieval**: Memory search utilizes a high-performance Google-style relevance engine built on SQLite FTS5.
- **Auto-indexing**: Markdown files in `/memory/` or `/memories/` directories within your project are automatically parsed and stored.

---

## ⚙️ Manual Configuration (Optional)

If the interactive prompt didn't detect your IDE, or if you prefer to configure things manually, you can add TokenOS to your MCP configuration file.

The command is simply `npx -y tokenos .`. Because of the `.`, you do not need to hardcode the path. The IDE automatically swaps the `.` for whatever project folder you currently have open on your screen.

### Antigravity IDE (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "tokenos": {
      "command": "npx",
      "args": ["-y", "tokenos", "."]
    }
  }
}
```

### Claude Desktop Mac (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "tokenos": {
      "command": "npx",
      "args": ["-y", "tokenos", "."]
    }
  }
}
```

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "tokenos": {
      "command": "npx",
      "args": ["-y", "tokenos", "."]
    }
  }
}
```

---

## 🚧 Roadmap: Auto-Context Engine

I am building toward an automated context system where the AI knows the state of your project before you even ask:

- **Session Capture**: End-of-day structured summaries of accomplishments and next steps.
- **Distillation**: A background process that condenses multiple session captures into a single "Project Profile".
- **Document Ingestion**: Instant indexing and searchability for existing design docs.

---

## License

MIT

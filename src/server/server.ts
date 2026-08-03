import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  getNode,
  getNodesByName,
  getNeighbors,
  getNodesWithEmbeddings,
  getConnectedNodes,
  getReverseConnectedNodes,
  getTopNodes,
  searchNodesExtended,
  searchMemories,
  getAllMemories,
  upsertMemory,
  deleteMemory,
  upsertSession,
  searchSessions,
  getSessionCount,
  getNodesByNameAndTypeExtended,
  searchNodesByTerms,
  ftsSearch,
  db,
} from "../db/index.js";
import {
  distillProfile,
  getProjectProfile,
  profileToMarkdown,
  shouldDistill,
} from "../distillation/distill.js";
import { config } from "../config.js";
import { generateEmbedding, rankBySimilarity, checkOllama } from "../embeddings/index.js";
import { logger } from "../utils/logger.js";
import type { GraphNode, SearchResult, QueryMode, ConversationMemory, SessionCapture } from "../types.js";

// ───── Constants ──────────────────────────────────────────────────────────────

/** Truncate responses at this size to prevent overwhelming the LLM context */
const CHARACTER_LIMIT = 25_000;

// ───── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[...truncated: response exceeded ${CHARACTER_LIMIT} chars. ` +
    `Use a smaller depth, tighter query, or add a type filter to reduce results.]`
  );
}

function buildSubgraph(
  startId: string,
  maxDepth: number,
  options?: { edgeTypes?: string[]; nodeTypes?: string[] }
): { nodes: GraphNode[]; edges: unknown[] } {
  const visitedNodes = new Map<string, GraphNode>();
  const visitedEdgeKeys = new Set<string>();
  const visitedEdges: unknown[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visitedNodes.has(item.id) || item.depth > maxDepth) continue;

    const node = getNode(item.id);
    if (!node) continue;
    if (options?.nodeTypes && options.nodeTypes.length > 0 && !options.nodeTypes.includes(node.type)) {
      continue;
    }
    visitedNodes.set(item.id, node);

    if (item.depth < maxDepth) {
      for (const edge of getNeighbors(item.id)) {
        if (options?.edgeTypes && options.edgeTypes.length > 0 && !options.edgeTypes.includes(edge.type)) {
          continue;
        }
        // Deduplicate edges at traversal time — fixes explore + search in one place
        const edgeKey = `${edge.from_node}|${edge.to_node}|${edge.type}`;
        if (!visitedEdgeKeys.has(edgeKey)) {
          visitedEdgeKeys.add(edgeKey);
          visitedEdges.push(edge);
        }
        const nextId = edge.from_node === item.id ? edge.to_node : edge.from_node;
        if (!visitedNodes.has(nextId)) {
          queue.push({ id: nextId, depth: item.depth + 1 });
        }
      }
    }
  }

  return { nodes: Array.from(visitedNodes.values()), edges: visitedEdges };
}

function compressNode(node: GraphNode, options?: { includeCode?: boolean; includeSummary?: boolean; includeEmbedding?: boolean }) {
  let metaObj: Record<string, unknown> | undefined;
  if (node.meta) {
    try {
      metaObj = typeof node.meta === 'string' ? JSON.parse(node.meta) : node.meta;
    } catch {}
  }

  const includeCode = options?.includeCode ?? false;
  const includeSummary = options?.includeSummary ?? true;
  const includeEmbedding = options?.includeEmbedding ?? false;

  // Strip null/empty fields — reduces payload ~15-20% and stays under MCP client inline threshold
  const result: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  if (includeSummary && node.summary) result.summary = node.summary;
  if (node.importance) result.importance = node.importance;
  if (metaObj && Object.keys(metaObj).length > 0) result.meta = metaObj;
  if (includeCode && node.code_snippet) result.code_snippet = node.code_snippet;
  if (includeEmbedding && node.embedding) result.embedding = node.embedding;
  return result;
}

function compressGraph(graph: { nodes: GraphNode[]; edges: any[] }, options?: { includeCode?: boolean; includeSummary?: boolean; includeEmbedding?: boolean }) {
  return {
    nodes: graph.nodes.map(n => compressNode(n, options)),
    // Strip autoincrement edge id — adds no value for AI agents and inflates payload
    edges: graph.edges.map((e: any) => ({ from: e.from_node, to: e.to_node, type: e.type })),
  };
}

// ───── Zod schemas (defined once, reused in tool registration) ────────────────

const ResponseFormatSchema = z
  .enum(["json", "markdown"])
  .default("json")
  .describe("Output format — 'json' for programmatic use, 'markdown' for human-readable");

const NodeIdSchema = z
  .string()
  .describe("Node ID in the format filePath::name (e.g. 'src/utils/cache.ts::LRUCache')");

// ───── Server factory ─────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({ name: "tokenos-server", version: "2.1.0" });

  // ── search ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search",
      description: `Smart search that understands intent and returns the most relevant code and context.

Args:
  - query (string): Natural language question or search term.
  - response_format: 'json' (default) or 'markdown'

Returns:
  Compressed, relevant context (code + relationships + memory).`,
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        response_format: ResponseFormatSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, response_format }) => {
      // 1. Detect Intent
      const q = query.toLowerCase();
      let mode: QueryMode = "semantic";
      if (q.includes("trace") || q.includes("flow") || q.includes("how") || q.includes("why")) {
        mode = "trace";
      } else if (q.includes("where") || q.includes("what") || q.includes("find")) {
        mode = "explore";
      } else if (q.includes("depend") || q.includes("import") || q.includes("export")) {
        mode = "dependency";
      }

      // 2. Hybrid Search
      // ftsSearch called once — result reused for both textResults and the Ollama-offline branch
      const ftsResults = ftsSearch(query);
      const textResults = (ftsResults.length > 0 ? ftsResults : searchNodesExtended(query))
        .filter(n => n.type !== "import"); // import nodes are noise in intent-based queries

      const semanticVec = await generateEmbedding(query);
      const semanticAvailable = semanticVec !== null;
      let semanticResults: SearchResult[] = [];

      if (semanticVec) {
        const candidates = getNodesWithEmbeddings();
        semanticResults = rankBySimilarity(semanticVec, candidates, 10);
      } else {
        // Ollama offline — reuse cached ftsResults (no second call)
        if (ftsResults.length > 0) {
          semanticResults = ftsResults.slice(0, 10);
        } else {
          // Final fallback: multi-term LIKE with stop-word filter
          const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "has", "have"]);
          const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3 && !STOP_WORDS.has(t));
          if (terms.length > 0) {
            const termResults: SearchResult[] = [];
            for (const term of terms.slice(0, 5)) {
              termResults.push(...searchNodesExtended(term));
            }
            const countMap = new Map<string, { node: SearchResult; count: number }>();
            for (const r of termResults) {
              const existing = countMap.get(r.id);
              if (existing) existing.count++;
              else countMap.set(r.id, { node: r, count: 1 });
            }
            semanticResults = Array.from(countMap.values())
              .sort((a, b) => b.count - a.count || b.node.importance - a.node.importance)
              .slice(0, 10)
              .map(e => e.node);
          }
        }
      }

      const combined = [...textResults.slice(0, 10), ...semanticResults.slice(0, 5)];
      const uniqueIds = Array.from(new Set(combined.map(n => n.id)));

      // 3. Expand Graph
      const depth = mode === "trace" ? 2 : 1;
      const finalGraph = { nodes: [] as GraphNode[], edges: [] as unknown[] };
      const options: { edgeTypes?: string[] } = {};
      if (mode === "dependency") {
        options.edgeTypes = ["IMPORTS", "EXPORTS"];
      }

      const seen = new Set<string>();

      for (const id of uniqueIds.slice(0, 5)) {
        if (seen.has(id)) continue;
        const sub = buildSubgraph(id, depth, options);
        for (const n of sub.nodes) {
          if (!seen.has(n.id)) {
            finalGraph.nodes.push(n);
            seen.add(n.id);
          }
        }
        finalGraph.edges.push(...sub.edges);
      }

      // buildSubgraph already deduplicates edges internally

      // 4. Memory Retrieval
      const memories = searchMemories(query).slice(0, 3);

      const output = {
        mode,
        semantic_available: semanticAvailable,
        graph: compressGraph(finalGraph),
        memories: memories.map(m => ({
          id: m.id,
          title: m.title,
          summary: m.summary,
          key_points: m.key_points,
          tags: m.tags,
        })),
      };

      let text: string;
      if (response_format === "markdown") {
        text = [
          `# Cognitive Search: "${query}"`,
          `Detected Mode: **${mode}** | Semantic: **${semanticAvailable ? 'yes' : 'no (FTS5/text fallback)'}**`,
          "",
          `## Codebase Context (${output.graph.nodes.length} nodes)`,
          ...output.graph.nodes.map(n => `- **${n.name}** (${n.type})\n  ${n.summary || ""}`),
          "",
          `## Related Memories (${output.memories.length})`,
          ...output.memories.map(m => `### ${m.title}\n${m.summary}\n`),
        ].join("\n");
      } else {
        text = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text", text: truncate(text) }],
        structuredContent: output,
      };
    }
  );

  // ── find_nodes ──────────────────────────────────────────────────────────────
  server.registerTool(
    "find_nodes",
    {
      title: "Find Nodes",
      description: `Find code elements by name, type, or meaning.

Args:
  - query (string): Function name, class name, or a natural-language description
  - type: Optional filter — 'function' | 'class' | 'file' | 'import' | 'variable' | 'component' | 'interface' | 'type_alias' | 'enum' | 'route'
  - mode: 'text' (default) or 'semantic' (Ollama embedding search)
  - limit (1-50, default 10): Max results per page
  - offset (default 0): Results to skip for pagination
  - response_format: 'json' (default) or 'markdown'

Returns:
  List of matching nodes with relevance ranking.`,
      inputSchema: z.object({
        query: z.string().describe("Search query — function name, class name, or description"),
        type: z
          .enum(["function", "class", "file", "import", "variable", "component", "interface", "type_alias", "enum", "route"])
          .optional()
          .describe("Filter by node type"),
        mode: z
          .enum(["text", "semantic"])
          .default("text")
          .describe("Search mode — text (default) or semantic (requires Ollama)"),
        limit: z.number().int().min(1).max(50).default(10).describe("Max results to return"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Results to skip for pagination"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, type, mode, limit, offset, response_format }) => {
      try {
        let allResults: SearchResult[];
        let semanticAvailable: boolean | undefined;

        if (mode === "semantic") {
          const queryVec = await generateEmbedding(query);
          if (queryVec) {
            // Only load nodes that have embeddings (+ optional type filter at SQL level)
            const candidates = getNodesWithEmbeddings(type);
            allResults = rankBySimilarity(queryVec, candidates, limit + offset);
            semanticAvailable = true;
          } else {
            logger.warn("tokenos", "Ollama unavailable, falling back to FTS5/text search");
            semanticAvailable = false;
            // FTS5 → multi-term → single-term fallback chain
            const ftsResults = ftsSearch(query);
            const terms = query.split(/\s+/).filter(t => t.length > 1);
            allResults = (ftsResults.length > 0
              ? ftsResults
              : terms.length > 1
                ? searchNodesByTerms(terms, type)
                : type
                  ? getNodesByNameAndTypeExtended(query, type)
                  : searchNodesExtended(query)
            ).map(n => ({ ...n, similarity: undefined }));
          }
        } else {
          // Text mode: FTS5 → multi-term → single-term
          const terms = query.split(/\s+/).filter(t => t.length > 1);
          let results: GraphNode[];
          if (terms.length > 1) {
            const ftsResults = ftsSearch(query);
            results = ftsResults.length > 0
              ? ftsResults
              : searchNodesByTerms(terms, type);
          } else {
            results = type
              ? getNodesByNameAndTypeExtended(query, type)
              : searchNodesExtended(query);
          }
          allResults = results
            .sort((a, b) => b.importance - a.importance)
            .map(n => ({ ...n, similarity: undefined }));
        }

        const total = allResults.length;
        const page = allResults.slice(offset, offset + limit);
        const hasMore = offset + page.length < total;

        const output: Record<string, unknown> = {
          total,
          count: page.length,
          offset,
          has_more: hasMore,
          ...(hasMore ? { next_offset: offset + page.length } : {}),
          ...(semanticAvailable !== undefined ? { semantic_available: semanticAvailable } : {}),
          nodes: page.map(n => compressNode(n)),
        };

        let text: string;
        if (response_format === "markdown") {
          const lines = [
            `# Search: "${query}"`,
            `Found **${total}** nodes — showing ${page.length} from offset ${offset}`,
            "",
          ];
          for (const n of page) {
            const metaStr = n.meta ? (() => {
              try {
                const m = JSON.parse(n.meta as string);
                const parts: string[] = [];
                if (m.role) parts.push(`role: ${m.role}`);
                if (m.tab) parts.push(`tab: ${m.tab}`);
                if (m.feature) parts.push(`feature: ${m.feature}`);
                if (m.route) parts.push(`route: ${m.route}`);
                return parts.length ? ` — ${parts.join(", ")}` : "";
              } catch { return ""; }
            })() : "";
            lines.push(`## ${n.name} \`(${n.type})\`${metaStr}`);
            lines.push(`- **ID**: \`${n.id}\``);
            lines.push(`- **File**: ${n.file_path}`);
            lines.push(`- **Importance**: ${n.importance}`);
            if (n.similarity != null) lines.push(`- **Similarity**: ${n.similarity.toFixed(3)}`);
            lines.push("");
          }
          if (hasMore) lines.push(`> Use \`offset=${offset + page.length}\` to see more results.`);
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: truncate(text) }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error searching nodes: ${error instanceof Error ? error.message : String(error)}. Try a different query or check the database.`,
            },
          ],
        };
      }
    },
  );

  // ── get_node ────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_node",
    {
      title: "Get Node",
      description: `Get full details of a specific code element.

Args:
  - id (string): Node ID in format 'filePath::name'
  - response_format: 'json' (default) or 'markdown'

Returns:
  Complete node data (code, type, file, importance).`,
      inputSchema: z.object({
        id: NodeIdSchema,
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, response_format }) => {
      const node = getNode(id);
      if (!node) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Node not found: "${id}". Use find_nodes to find the correct ID.`,
            },
          ],
        };
      }

      // For file nodes: synthesize a barrel-style export list from DEFINES graph edges
      // Pure graph traversal — no file I/O, no re-parsing
      if (node.type === "file" && !node.code_snippet) {
        const edges = getNeighbors(node.id);
        const exportLines = edges
          .filter(e => e.type === "DEFINES" && e.from_node === node.id)
          .map(e => {
            const exportNode = getNode(e.to_node);
            return exportNode ? `export ${exportNode.type} ${exportNode.name}` : null;
          })
          .filter((l): l is string => l !== null);
        if (exportLines.length > 0) {
          node.code_snippet = exportLines.join("\n");
        }
      }

      const compressedNode = compressNode(node, { includeCode: true });

      let text: string;
      if (response_format === "markdown") {
        const lines = [
          `# ${node.name} \`(${node.type})\``,
          `- **ID**: \`${node.id}\``,
          `- **File**: ${node.file_path}`,
          `- **Importance**: ${node.importance}`,
        ];
        if (node.summary) lines.push(`- **Summary**: ${node.summary}`);
        if (node.code_snippet) lines.push(`\n\`\`\`typescript\n${node.code_snippet}\n\`\`\``);
        text = lines.join("\n");
      } else {
        text = JSON.stringify(compressedNode, null, 2);
      }

      return {
        content: [{ type: "text", text }],
        structuredContent: compressedNode,
      };
    },
  );

  // ── get_connections ─────────────────────────────────────────────────────────
  server.registerTool(
    "get_connections",
    {
      title: "Get Connections",
      description: `Get directly related code elements.

Args:
  - id (string): Node ID to find connections for
  - include_reverse (boolean, default false): Include nodes that USE this node (callers, importers). Off by default — hub nodes can have hundreds of callers.
  - limit (integer, default 50): Max connected nodes to return (1-100)
  - response_format: 'json' (default) or 'markdown'

Returns:
  Connected nodes and their relationships. When include_reverse is true, also returns used_by array.`,
      inputSchema: z.object({
        id: NodeIdSchema,
        include_reverse: z.boolean().default(false).describe("Include reverse edges (nodes that USE this node). Off by default to keep responses compact."),
        limit: z.number().int().min(1).max(100).default(50).describe("Max connected nodes to return"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, include_reverse, limit, response_format }) => {
      const node = getNode(id);
      if (!node) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Node not found: "${id}". Use find_nodes to find the correct ID.`,
            },
          ],
        };
      }

      const edges = getNeighbors(id);
      const connectedNodes = getConnectedNodes(id).slice(0, limit);
      const usedBy = include_reverse ? getReverseConnectedNodes(id).slice(0, limit) : [];

      const output: Record<string, unknown> = {
        node: compressNode(node),
        edges,
        connected_nodes: connectedNodes.map(n => compressNode(n)),
        ...(include_reverse ? { used_by: usedBy.map(n => compressNode(n)) } : {}),
      };

      let text: string;
      if (response_format === "markdown") {
        const lines = [
          `# Neighbors of \`${node.name}\``,
          `**${edges.length}** edges · **${connectedNodes.length}** connected nodes${include_reverse ? ` · **${usedBy.length}** callers` : ""}`,
          "",
          "## Edges",
        ];
        for (const e of edges) {
          lines.push(`- \`${e.from_node}\` → \`${e.to_node}\` **(${e.type})**`);
        }
        if (connectedNodes.length > 0) {
          lines.push("", "## Connected Nodes");
          for (const n of connectedNodes) {
            lines.push(`- **${n.name}** \`(${n.type})\` — importance: ${n.importance}`);
          }
        }
        if (include_reverse && usedBy.length > 0) {
          lines.push("", "## Used By (callers / importers)");
          for (const n of usedBy) {
            lines.push(`- **${n.name}** \`(${n.type})\` — importance: ${n.importance}`);
          }
        }
        text = lines.join("\n");
      } else {
        text = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text", text: truncate(text) }],
        structuredContent: output,
      };
    },
  );

  // ── explore ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "explore",
    {
      title: "Explore",
      description: `Explore surrounding code context from a starting point.

Args:
  - id (string): Starting node ID
  - depth (1-3, default 2): Max traversal depth
  - include_imports (boolean, default true): Include import nodes in traversal. Set false to reduce noise.

Returns:
  Local graph (nodes + relationships).`,
      inputSchema: z.object({
        id: NodeIdSchema,
        depth: z
          .number()
          .int()
          .min(1)
          .max(3)
          .default(2)
          .describe("Max traversal depth (1-3, default 2)"),
        include_imports: z
          .boolean()
          .default(true)
          .describe("Include import nodes in traversal. Set false for cleaner structural exploration."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, depth, include_imports }) => {
      const startNode = getNode(id);
      if (!startNode) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Node not found: "${id}". Use find_nodes to find the correct ID.`,
            },
          ],
        };
      }

      // When include_imports is false, restrict BFS to structural node types only
      const opts = include_imports
        ? undefined
        : { nodeTypes: ["function", "class", "component", "file", "interface", "type_alias", "enum", "route", "variable"] };
      const subgraph = buildSubgraph(id, depth, opts);
      const output = compressGraph(subgraph);

      return {
        content: [{ type: "text", text: truncate(JSON.stringify(output, null, 2)) }],
        structuredContent: output,
      };
    },
  );

  // ── status ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "status",
    {
      title: "Status",
      description: "Get TokenOS system status — DB stats, Ollama availability, indexed counts, and capability flags.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const ollamaOk = await checkOllama();
      const nodeCount = (db.prepare("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c;
      const edgeCount = (db.prepare("SELECT COUNT(*) as c FROM edges").get() as { c: number }).c;
      const embeddingCount = (db.prepare("SELECT COUNT(*) as c FROM nodes WHERE embedding IS NOT NULL").get() as { c: number }).c;
      const ftsCount = (() => {
        try { return (db.prepare("SELECT COUNT(*) as c FROM nodes_fts").get() as { c: number }).c; } catch { return 0; }
      })();

      const output = {
        version: "2.1.0",
        nodes: nodeCount,
        edges: edgeCount,
        embeddings: embeddingCount,
        fts_indexed: ftsCount,
        capabilities: {
          text_search: true,
          fts5: ftsCount > 0,
          semantic_search: ollamaOk,
          graph_traversal: true,
          reverse_edges: true,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  // ── top_nodes ───────────────────────────────────────────────────────────────
  server.registerTool(
    "top_nodes",
    {
      title: "Top Nodes",
      description: `Get the most important parts of the codebase.

Args:
  - limit (1-100, default 20): Max nodes to return
  - response_format: 'json' (default) or 'markdown'

Returns:
  Ranked list of high-impact nodes.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20).describe("Max nodes to return"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      try {
        const nodes = getTopNodes(limit);

        const outputNodes = nodes.map(n => compressNode(n));

        let text: string;
        if (response_format === "markdown") {
          const lines = [`# Top ${nodes.length} Important Nodes`, ""];
          for (const [i, n] of nodes.entries()) {
            lines.push(`${i + 1}. **${n.name}** \`(${n.type})\` — score: **${n.importance}**`);
            lines.push(`   \`${n.file_path}\``);
          }
          text = lines.join("\n");
        } else {
          text = JSON.stringify({ count: outputNodes.length, nodes: outputNodes }, null, 2);
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: { count: outputNodes.length, nodes: outputNodes },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching important nodes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // ── save_memory ──────────────────────────────────────────────────────────────
  server.registerTool(
    "save_memory",
    {
      title: "Save Memory",
      description: `Save a piece of knowledge, decision, or context for future sessions.

Use this when you discover something worth remembering: architecture decisions,
user preferences, project patterns, debugging insights, or workflow notes.

Args:
  - title (string): Short descriptive title
  - summary (string): The actual content to remember
  - key_points (string[], optional): Bullet-point takeaways
  - tags (string[], optional): Categorization tags

Returns:
  Confirmation with the memory ID.`,
      inputSchema: z.object({
        title: z.string().describe("Short descriptive title for the memory"),
        summary: z.string().describe("The content to remember — decisions, patterns, context"),
        key_points: z.array(z.string()).default([]).describe("Bullet-point takeaways"),
        tags: z.array(z.string()).default(["memory"]).describe("Categorization tags"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ title, summary, key_points, tags }) => {
      const id = `mem::${randomUUID().slice(0, 8)}`;
      const memory: ConversationMemory = {
        id,
        title,
        summary,
        key_points,
        tags,
        created_at: Date.now(),
      };

      upsertMemory(memory);
      logger.success("memory", `saved: "${title}" (${id})`);

      const output = { saved: true, id, title, tags };
      return {
        content: [{ type: "text", text: `Memory saved: "${title}" (${id})` }],
        structuredContent: output,
      };
    },
  );

  // ── list_memories ───────────────────────────────────────────────────────────
  server.registerTool(
    "list_memories",
    {
      title: "List Memories",
      description: `List all stored memories, optionally filtered by a search query.

Args:
  - query (string, optional): Search term to filter memories. Omit to list all.
  - limit (integer, optional): Max results (default 20)

Returns:
  List of memories with title, summary, tags, and creation date.`,
      inputSchema: z.object({
        query: z.string().optional().describe("Search term to filter memories. Omit to list all."),
        limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      const memories = query ? searchMemories(query) : getAllMemories();
      const page = memories.slice(0, limit);

      const output = {
        total: memories.length,
        count: page.length,
        memories: page.map(m => ({
          id: m.id,
          title: m.title,
          summary: m.summary.length > 200 ? m.summary.slice(0, 200) + "..." : m.summary,
          key_points: m.key_points,
          tags: m.tags,
          created_at: new Date(m.created_at).toISOString(),
        })),
      };

      const lines = [
        `# Memories (${page.length}/${memories.length})`,
        "",
        ...page.map(m =>
          `- **${m.title}** \`${m.id}\`\n  ${m.tags.map(t => `#${t}`).join(" ")} · ${new Date(m.created_at).toLocaleDateString()}`
        ),
      ];

      return {
        content: [{ type: "text", text: truncate(lines.join("\n")) }],
        structuredContent: output,
      };
    },
  );

  // ── delete_memory ───────────────────────────────────────────────────────────
  server.registerTool(
    "delete_memory",
    {
      title: "Delete Memory",
      description: `Delete a stored memory by its ID.

Args:
  - id (string): The memory ID to delete (e.g. 'mem::a1b2c3d4')

Returns:
  Confirmation of deletion.`,
      inputSchema: z.object({
        id: z.string().describe("Memory ID to delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      const deleted = deleteMemory(id);
      if (!deleted) {
        return {
          isError: true,
          content: [{ type: "text", text: `Memory not found: "${id}". Use list_memories to find the correct ID.` }],
        };
      }

      logger.info("memory", `deleted: ${id}`);
      return {
        content: [{ type: "text", text: `Memory deleted: ${id}` }],
        structuredContent: { deleted: true, id },
      };
    },
  );

  // ── capture_session ───────────────────────────────────────────────────────
  server.registerTool(
    "capture_session",
    {
      title: "Capture Session",
      description: `Save structured context at the end of a work session.

Call this before the conversation ends to preserve what happened,
what decisions were made, and where to pick up next time.

Args:
  - summary: What happened this session
  - decisions: Decisions made (architecture, patterns, trade-offs)
  - patterns: Patterns reinforced or newly learned
  - next_context: Where we left off — breadcrumb for the next session
  - tags: Categorization tags (defaults to ["session"])

Returns:
  Confirmation with session ID. Triggers distillation if N sessions reached.`,
      inputSchema: z.object({
        summary: z.string().describe("What happened this session"),
        decisions: z.array(z.string()).default([]).describe("Decisions made this session"),
        patterns: z.array(z.string()).default([]).describe("Patterns reinforced or learned"),
        next_context: z.string().default("").describe("Where we left off — breadcrumb for next session"),
        tags: z.array(z.string()).default(["session"]).describe("Categorization tags"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ summary, decisions, patterns, next_context, tags }) => {
      const id = `session::${randomUUID().slice(0, 8)}`;
      const session: SessionCapture = {
        id,
        summary,
        decisions,
        patterns,
        next_context,
        tags,
        created_at: Date.now(),
      };

      upsertSession(session);
      logger.success("session", `captured: "${summary.slice(0, 60)}..." (${id})`);

      let distilled = false;
      if (shouldDistill(config.distillation.everyNSessions)) {
        try {
          distillProfile();
          distilled = true;
          logger.success("distill", `profile updated after ${getSessionCount()} sessions`);
        } catch (err) {
          logger.warn("distill", `distillation failed: ${String(err)}`);
        }
      }

      const output = {
        saved: true,
        id,
        session_count: getSessionCount(),
        distillation_ran: distilled,
      };

      return {
        content: [{
          type: "text",
          text: `Session captured (${id}). Total sessions: ${output.session_count}.${distilled ? " Project profile updated." : ""}`,
        }],
        structuredContent: output,
      };
    },
  );

  // ── get_project_context ────────────────────────────────────────────────────
  server.registerTool(
    "get_project_context",
    {
      title: "Get Project Context",
      description: `Get the distilled project profile — decisions, patterns, and current state.

Returns a condensed view of everything learned across all past sessions.
Use this at the start of a session to orient yourself quickly.

Returns:
  Markdown-formatted project profile, or instructions to capture sessions first.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const profile = getProjectProfile(config.watchPath);

      if (!profile) {
        const sessionCount = getSessionCount();
        const msg = sessionCount === 0
          ? "No project profile yet. Use capture_session at the end of a few work sessions to build one."
          : `No profile yet (${sessionCount} sessions recorded but threshold not reached). Call capture_session ${config.distillation.everyNSessions - (sessionCount % config.distillation.everyNSessions)} more time(s) to trigger distillation.`;
        return {
          content: [{ type: "text", text: msg }],
          structuredContent: { profile: null, message: msg },
        };
      }

      const markdown = profileToMarkdown(profile);
      return {
        content: [{ type: "text", text: truncate(markdown) }],
        structuredContent: { ...profile } as Record<string, unknown>,
      };
    },
  );

  // ── search_docs ──────────────────────────────────────────────────────────────
  server.registerTool(
    "search_docs",
    {
      title: "Search Documents",
      description: `Search through indexed project documentation (dev-data, docs, etc.).

Docs are automatically indexed from directories specified in tokenos.config.json
(default: dev-data/, docs/). Different from search which targets code nodes.

Args:
  - query (string): Search term
  - limit (integer, optional): Max results (default 5)

Returns:
  List of matching documents with title, summary, and tags.`,
      inputSchema: z.object({
        query: z.string().describe("Search term"),
        limit: z.number().int().min(1).max(20).default(5).describe("Max results"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      // Filter memories tagged as documents
      const allResults = searchMemories(query).filter(
        m => m.tags.includes("document") || m.tags.includes("knowledge")
      );
      const page = allResults.slice(0, limit);

      const output = {
        total: allResults.length,
        count: page.length,
        docs: page.map(m => ({
          id: m.id,
          title: m.title,
          summary: m.summary.length > 300 ? m.summary.slice(0, 300) + "..." : m.summary,
          key_points: m.key_points,
          tags: m.tags,
        })),
      };

      const lines = [
        `# Document Search: "${query}" (${page.length} result${page.length !== 1 ? "s" : ""})`,
        "",
        ...page.map(m => [
          `## ${m.title}`,
          m.tags.map(t => `\`${t}\``).join(" "),
          "",
          m.summary.length > 300 ? m.summary.slice(0, 300) + "..." : m.summary,
          "",
        ].join("\n")),
      ];

      return {
        content: [{ type: "text", text: truncate(lines.join("\n")) }],
        structuredContent: output,
      };
    },
  );

  // ── MCP Resource: project-context (Phase 6 — auto-injection) ─────────────
  //
  // Exposes the distilled project profile as a named MCP resource.
  // MCP clients that support Resources (including Antigravity) auto-load this
  // at session start — the AI receives full project context before the first message.
  server.resource(
    "project-context",
    "tokenos://project-context",
    async () => {
      const profile = getProjectProfile(config.watchPath);

      const text = profile
        ? profileToMarkdown(profile)
        : [
            "# Project Context",
            "",
            "No project profile has been distilled yet.",
            "",
            `Tip: Use \`capture_session\` at the end of work sessions.`,
            `A profile is generated automatically after every ${config.distillation.everyNSessions} sessions.`,
          ].join("\n");

      return {
        contents: [{
          uri: "tokenos://project-context",
          mimeType: "text/markdown",
          text,
        }],
      };
    }
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  transport.onclose = async () => {
    logger.info("server", "stdio transport closed (client disconnected)");
    process.exit(0);
  };
}

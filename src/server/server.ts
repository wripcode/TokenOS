import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getNode,
  getNodesByName,
  getNodesByNameAndType,
  getNodesWithEmbeddings,
  getNeighbors,
  getConnectedNodes,
  getTopNodes,
  searchNodesExtended,
  searchMemories,
} from "../db/index.js";
import { generateEmbedding, rankBySimilarity } from "../embeddings/index.js";
import { logger } from "../utils/logger.js";
import type { GraphNode, SearchResult, QueryMode } from "../types.js";

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
        visitedEdges.push(edge);
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
  let metaObj = undefined;
  if (node.meta) {
    try {
      metaObj = typeof node.meta === 'string' ? JSON.parse(node.meta) : node.meta;
    } catch {}
  }
  
  const includeCode = options?.includeCode ?? false;
  const includeSummary = options?.includeSummary ?? true;
  const includeEmbedding = options?.includeEmbedding ?? false;

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    ...(includeSummary ? { summary: node.summary } : {}),
    importance: node.importance,
    meta: metaObj,
    ...(includeCode ? { code_snippet: node.code_snippet } : {}),
    ...(includeEmbedding && node.embedding ? { embedding: node.embedding } : {}),
  };
}

function compressGraph(graph: { nodes: GraphNode[]; edges: any[] }, options?: { includeCode?: boolean; includeSummary?: boolean; includeEmbedding?: boolean }) {
  return {
    nodes: graph.nodes.map(n => compressNode(n, options)),
    edges: graph.edges,
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
  const server = new McpServer({ name: "tokenos-server", version: "1.1.0" });

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
      const textResults = searchNodesExtended(query);
      const semanticVec = await generateEmbedding(query);
      let semanticResults: SearchResult[] = [];
      if (semanticVec) {
        const candidates = getNodesWithEmbeddings();
        semanticResults = rankBySimilarity(semanticVec, candidates, 10);
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
      
      // De-duplicate edges
      const edgeSet = new Set<string>();
      const uniqueEdges = [];
      for (const e of finalGraph.edges as any[]) {
        const key = `${e.from_node}|${e.to_node}|${e.type}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          uniqueEdges.push(e);
        }
      }
      finalGraph.edges = uniqueEdges;

      // 4. Memory Retreival
      const memories = searchMemories(query).slice(0, 3);

      const output = {
        mode,
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
          `Detected Mode: **${mode}**`,
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
  - limit (1–50, default 10): Max results per page
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

        if (mode === "semantic") {
          const queryVec = await generateEmbedding(query);
          if (queryVec) {
            // Only load nodes that have embeddings (+ optional type filter at SQL level)
            const candidates = getNodesWithEmbeddings(type);
            allResults = rankBySimilarity(queryVec, candidates, limit + offset);
          } else {
            logger.warn("tokenos", "Ollama unavailable, falling back to text search");
            allResults = getNodesByName(query).map((n) => ({ ...n, similarity: undefined }));
          }
        } else {
          // Text search: AND filter when type provided, extended meta search otherwise
          const results = type
            ? getNodesByNameAndType(query, type)
            : searchNodesExtended(query);
          allResults = results
            .sort((a, b) => b.importance - a.importance)
            .map((n) => ({ ...n, similarity: undefined }));
        }

        const total = allResults.length;
        const page = allResults.slice(offset, offset + limit);
        const hasMore = offset + page.length < total;

        const output = {
          total,
          count: page.length,
          offset,
          has_more: hasMore,
          ...(hasMore ? { next_offset: offset + page.length } : {}),
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
  - response_format: 'json' (default) or 'markdown'

Returns:
  Connected nodes and their relationships.`,
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

      const edges = getNeighbors(id);
      const connectedNodes = getConnectedNodes(id);
      const output = { 
        node: compressNode(node), 
        edges, 
        connected_nodes: connectedNodes.map(n => compressNode(n)) 
      };

      let text: string;
      if (response_format === "markdown") {
        const lines = [
          `# Neighbors of \`${node.name}\``,
          `**${edges.length}** edges · **${connectedNodes.length}** connected nodes`,
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
  - depth (1–3, default 2): Max traversal depth

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
          .describe("Max traversal depth (1–3, default 2)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, depth }) => {
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

      const subgraph = buildSubgraph(id, depth);
      const output = compressGraph(subgraph);

      return {
        content: [{ type: "text", text: truncate(JSON.stringify(output, null, 2)) }],
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
  - limit (1–100, default 20): Max nodes to return
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

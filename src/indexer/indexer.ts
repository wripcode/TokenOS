import { readdir, stat } from "fs/promises";
import { join, extname, basename } from "path";
import { logger } from "../utils/logger.js";
import { parseFile as parseFileAST, removeFile as removeFileAST } from "./parser.js";
import { createIgnorer, isIgnored } from "./ignore.js";
import {
  db,
  upsertNode,
  upsertEdge,
  deleteNodesByFile,
  deleteEdgesByFile,
  getNode,
  upsertMemory,
  ftsUpsertNode,
} from "../db/index.js";
import type { ParsedNode, ConversationMemory } from "../types.js";
import { readFile } from "fs/promises";
import { hashContent } from "./parser.js";
import { config } from "../config.js";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx"]);
const MEMORY_EXTENSIONS = new Set([".md"]);

/**
 * Returns true for .md files that should be indexed: traditional /memory/ dirs
 * OR any directory listed in config.docs.paths (e.g. dev-data, docs).
 */
function isDocOrMemoryPath(fullPath: string): boolean {
  if (fullPath.includes("/memory/") || fullPath.includes("/memories/")) return true;
  return config.docs.paths.some(p => fullPath.includes(`/${p}/`));
}

/** Returns true if this path is a doc directory (not a traditional memory dir). */
function isDocPath(fullPath: string): boolean {
  return config.docs.paths.some(p => fullPath.includes(`/${p}/`));
}

// ───── Index a single file ─────────────────────────────────────────────────── 

export async function indexFile(filePath: string): Promise<{ nodes: number; edges: number; skipped: boolean }> {
  const { nodes, edges, hash } = parseFileAST(filePath);

  // Phase 3: skip if hash unchanged for the file node
  const fileNodeId = nodes.find((n) => n.type === "file")?.id;
  if (fileNodeId) {
    const existing = getNode(fileNodeId);
    if (existing?.hash === hash) {
      return { nodes: 0, edges: 0, skipped: true };
    }
  }

  // Remove stale data then insert fresh — all in one transaction so nodes
  // exist before edges are FK-checked
  const insertBatch = db.transaction(() => {
    deleteEdgesByFile(filePath);
    deleteNodesByFile(filePath);

    for (const node of nodes) {
      upsertNode(node as ParsedNode & { importance: number });
      ftsUpsertNode(node); // sync FTS inside same transaction — atomic with graph
    }

    for (const edge of edges) {
      // Edges may reference nodes outside this file (e.g., CALLS to external fn).
      // Skip those gracefully — they'll be wired up when that file is indexed.
      try {
        upsertEdge(edge);
      } catch {
        // FK constraint — target node not yet indexed; skip silently
      }
    }
  });

  insertBatch();

  return { nodes: nodes.length, edges: edges.length, skipped: false };
}

// ───── Remove a deleted file ───────────────────────────────────────────────── 

export function removeFile(filePath: string): void {
  deleteEdgesByFile(filePath);
  deleteNodesByFile(filePath);
  removeFileAST(filePath);
}

// ───── Index a memory or doc file ────────────────────────────────────────────

export async function indexMemoryFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const fileName = basename(filePath);

  const titleMatch = content.match(/^#\s+(.*)/m);
  const title = titleMatch ? titleMatch[1].trim() : fileName.replace(".md", "");

  const tagsMatch = content.match(/tags:\s*\[(.*?)\]/i) || content.match(/tags:\s*(.*)/i);
  const baseTags = isDocPath(filePath) ? ["document", "knowledge"] : ["memory"];
  const parsedTags = tagsMatch
    ? tagsMatch[1].split(",").map(t => t.trim())
    : baseTags;

  const bulletMatch = content.match(/^[*-]\s+(.*)/gm);
  const key_points = bulletMatch
    ? bulletMatch.map(b => b.replace(/^[*-]\s+/, "").trim()).slice(0, 10)
    : [];

  // Use first 1500 chars for docs (more context), 1000 for memories
  const summaryLength = isDocPath(filePath) ? 1500 : 1000;
  const summary = content.slice(0, summaryLength);

  const memoryId = `memory::${fileName}::${hashContent(content)}`;

  const memory: ConversationMemory = {
    id: memoryId,
    title,
    summary,
    key_points,
    tags: parsedTags,
    created_at: Date.now(),
  };

  upsertMemory(memory);
}

// ───── Walk and index a directory ─────────────────────────────────────────── 

export async function indexDirectory(dirPath: string): Promise<{ files: number; nodes: number; edges: number }> {
  const totals = { files: 0, nodes: 0, edges: 0 };
  const ig = createIgnorer(dirPath);

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dir, entry);
        if (isIgnored(ig, dirPath, fullPath)) return;
        const stats = await stat(fullPath).catch(() => null);
        if (!stats) return;

        if (stats.isDirectory()) {
          await walk(fullPath);
        } else if (stats.isFile()) {
           const ext = extname(entry);
           if (SUPPORTED_EXTENSIONS.has(ext)) {
             try {
               const result = await indexFile(fullPath);
               if (!result.skipped) {
                 totals.files++;
                 totals.nodes += result.nodes;
                 totals.edges += result.edges;
               }
             } catch (err) {
               logger.error("indexer", `Failed to index ${fullPath}:`, err);
             }
           } else if (MEMORY_EXTENSIONS.has(ext) && isDocOrMemoryPath(fullPath)) {
             try {
               await indexMemoryFile(fullPath);
               totals.files++;
             } catch (err) {
               logger.error("indexer", `Failed to index doc/memory ${fullPath}:`, err);
             }
           }
        }
      })
    );
  }

  await walk(dirPath);
  return totals;
}

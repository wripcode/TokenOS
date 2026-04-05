#!/usr/bin/env node

// ───── Version flag ───────────────────────────────────────────────────────────
if (process.argv.includes("--version")) {
  console.log("1.1.1");
  process.exit(0);
}

import { existsSync } from "fs";
import { config } from "./config.js";
import { startServer } from "./server/index.js";
import { startWatcher } from "./indexer/index.js";
import { indexDirectory } from "./indexer/indexer.js";
import { computeAllImportance } from "./utils/scoring.js";
// @ts-ignore - Valid Node16 module resolution, IDE false positive
import { backfillEmbeddings, checkOllama } from "./embeddings/index.js";
// @ts-ignore - Valid Node16 module resolution, IDE false positive
import { startVisualizationServer } from "./server/visualize.js";
import { logger } from "./utils/logger.js";

// ───── Validate ───────────────────────────────────────────────────────────────

if (!existsSync(config.watchPath)) {
  logger.error("tokenos", `watch path does not exist: ${config.watchPath}`);
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  logger.error("tokenos", "uncaught error:", err);
});

process.on("unhandledRejection", (reason) => {
  logger.error("tokenos", "unhandled rejection:", reason);
});

// ───── Bootstrap ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bootStart = Date.now();
  logger.info("tokenos", `starting — watching: ${config.watchPath}`);
  logger.info("tokenos", `database: ${config.dbPath}`);
  logger.info("tokenos", `embedding model: ${config.ollama.model}`);

  // Optionally start visualization UI
  if (config.ui.enabled) {
    try {
      await startVisualizationServer();
    } catch {
      logger.error("tokenos", "visualization UI failed to start");
    }
  }

  // Initial full index of the watched directory
  logger.info("tokenos", "running initial index...");
  const totals = await indexDirectory(config.watchPath);
  logger.success("tokenos", `initial index complete: ${totals.files} files, ${totals.nodes} nodes, ${totals.edges} edges`);

  // Compute importance scores for all nodes
  const { updated: scored } = computeAllImportance();
  logger.success("tokenos", `importance scoring complete: ${scored} nodes scored`);

  // Start chokidar watcher for incremental updates (ignoreInitial=true — initial index is done)
  const watcher = startWatcher(config.watchPath, {
    onReady: () => logger.success("watcher", "ready"),
  });

  // Start MCP stdio server first — client connects immediately without waiting for embeddings
  const ollamaOk = await checkOllama();
  await startServer();

  // Back-fill embeddings non-blocking — large projects won't timeout the MCP handshake
  if (ollamaOk) {
    backfillEmbeddings()
      .then(({ updated, skipped }: { updated: number; skipped: number }) => {
        logger.success("tokenos", `embeddings ready: ${updated} updated, ${skipped} skipped`);
      })
      .catch(() => {
        logger.warn("tokenos", "embeddings backfill failed");
      });
  } else {
    logger.warn("tokenos", "embeddings skipped (Ollama offline)");
  }

  logger.viteLike({
    version: "1.1.1",
    timeMs: Date.now() - bootStart,
    localUrl: config.ui.enabled ? `http://localhost:${config.ui.port}/graph` : undefined,
    ollamaOk,
    sqliteOk: true,
    cwd: config.watchPath,
    model: config.ollama.model,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info("tokenos", `shutting down (${signal})...`);
    try {
      await watcher.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.stdin.on("close", () => shutdown("client disconnected"));
  process.stdout.on("close", () => shutdown("stdout closed"));
}

main().catch((err) => {
  logger.error("tokenos", "fatal:", err);
  process.exit(1);
});

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

  // Back-fill embeddings for newly indexed nodes (graceful if Ollama is offline)
  const ollamaOk = await checkOllama();
  if (ollamaOk) {
    try {
      logger.info("tokenos", "backfilling embeddings...");
      const { updated, skipped } = await backfillEmbeddings();
      logger.success("tokenos", `embeddings ready: ${updated} updated, ${skipped} skipped`);
    } catch {
      logger.warn("tokenos", "embeddings skipped (Ollama unavailable)");
    }
  } else {
    logger.warn("tokenos", "embeddings skipped (Ollama offline)");
  }

  // Compute importance scores for all nodes
  const { updated: scored } = computeAllImportance();
  logger.success("tokenos", `importance scoring complete: ${scored} nodes scored`);

  // Start chokidar watcher for incremental updates (ignoreInitial=true — initial index is done)
  const watcher = startWatcher(config.watchPath, {
    onReady: () => logger.success("watcher", "ready"),
  });

  // Start MCP stdio server (blocks until client disconnects)
  await startServer();

  logger.viteLike({
    version: "1.0.0",
    timeMs: Date.now() - bootStart,
    localUrl: config.ui.enabled ? `http://localhost:${config.ui.port}/graph` : undefined,
    ollamaOk,
    sqliteOk: true,
    cwd: config.watchPath,
    model: config.ollama.model,
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("tokenos", "shutting down...");
    await watcher.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("tokenos", "shutting down...");
    await watcher.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("tokenos", "fatal:", err);
  process.exit(1);
});

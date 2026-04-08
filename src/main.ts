#!/usr/bin/env node

if (process.argv.includes("--version")) {
  console.log("2.1.0");
  process.exit(0);
}

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
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

if (process.argv.includes("kill") || process.argv[2] === "kill") {
  const killPidFile = join(process.cwd(), ".tokenos", "tokenos.pid");
  if (existsSync(killPidFile)) {
    const pid = parseInt(readFileSync(killPidFile, "utf-8").trim(), 10);
    try {
      process.kill(pid, "SIGTERM");
      unlinkSync(killPidFile);
      console.log(`killed tokenos process (pid ${pid})`);
    } catch {
      console.log(`process ${pid} already dead`);
    }
  } else {
    console.log("no tokenos process running");
  }
  process.exit(0);
}

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

const PID_FILE = join(config.watchPath, ".tokenos", "tokenos.pid");

async function acquireLock(): Promise<void> {
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        process.kill(oldPid, "SIGTERM");
        for (let i = 0; i < 40; i++) {
          try {
            process.kill(oldPid, 0);
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch {
            break;
          }
        }
      } catch {}
    }
  }
  writeFileSync(PID_FILE, String(process.pid), "utf-8");
}

function releaseLock(): void {
  try {
    if (existsSync(PID_FILE)) {
      const storedPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (storedPid === process.pid) unlinkSync(PID_FILE);
    }
  } catch {}
}

async function main(): Promise<void> {
  await acquireLock();

  const bootStart = Date.now();
  logger.info("tokenos", `starting — watching: ${config.watchPath}`);
  logger.info("tokenos", `database: ${config.dbPath}`);

  if (config.ui.enabled) {
    try {
      await startVisualizationServer();
    } catch {
      logger.error("tokenos", "visualization UI failed to start");
    }
  }

  logger.info("tokenos", "running initial index...");
  const totals = await indexDirectory(config.watchPath);
  logger.success("tokenos", `initial index complete: ${totals.files} files, ${totals.nodes} nodes, ${totals.edges} edges`);

  const { updated: scored } = computeAllImportance();
  logger.success("tokenos", `importance scoring complete: ${scored} nodes scored`);

  const watcher = startWatcher(config.watchPath, {
    onReady: () => logger.success("watcher", "ready"),
  });

  const ollamaOk = await checkOllama();
  await startServer();

  if (ollamaOk) {
    logger.info("tokenos", `embedding model: ${config.ollama.model} (online)`);
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
    version: "2.1.0",
    timeMs: Date.now() - bootStart,
    localUrl: config.ui.enabled ? `http://localhost:${config.ui.port}/graph` : undefined,
    ollamaOk,
    sqliteOk: true,
    cwd: config.watchPath,
    model: config.ollama.model,
  });

  const shutdown = async (signal: string) => {
    logger.info("tokenos", `shutting down (${signal})...`);
    releaseLock();
    try {
      await watcher.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.stdin.on("close", () => shutdown("client disconnected"));
  process.stdout.on("close", () => shutdown("stdout closed"));

  const heartbeat = setInterval(() => {
    if (process.stdin.destroyed || process.stdout.destroyed) {
      clearInterval(heartbeat);
      shutdown("pipe destroyed");
    }
  }, 30_000);
  heartbeat.unref();
}

main().catch((err) => {
  logger.error("tokenos", "fatal:", err);
  process.exit(1);
});

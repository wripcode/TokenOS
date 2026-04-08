import chokidar, { type FSWatcher } from "chokidar";
import { indexFile, removeFile } from "./indexer.js";
import { logger } from "../utils/logger.js";

import { createIgnorer, isIgnored } from "./ignore.js";

export interface WatcherOptions {
  onReady?: () => void;
  onError?: (err: Error) => void;
}

export function startWatcher(watchPath: string, options: WatcherOptions = {}): FSWatcher {
  const ig = createIgnorer(watchPath);

  const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", ".tokenos", ".turbo", ".cache", "coverage", "out"]);

  const watcher = chokidar.watch(watchPath, {
    ignored: (testPath: string) => {
      if (testPath === watchPath) return false;
      const base = testPath.split("/").pop() ?? "";
      if (IGNORED_DIRS.has(base)) return true;
      return isIgnored(ig, watchPath, testPath);
    },
    persistent: true,
    ignoreInitial: true,
    usePolling: false,
    interval: 1000,
    binaryInterval: 3000,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher
    .on("add", async (filePath) => {
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return;
      try {
        const result = await indexFile(filePath);
        if (!result.skipped) {
          logger.info("watcher", `added: ${filePath} (+${result.nodes} nodes, +${result.edges} edges)`);
        }
      } catch (err) {
        logger.error("watcher", `error indexing ${filePath}:`, err);
      }
    })
    .on("change", async (filePath) => {
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return;
      try {
        const result = await indexFile(filePath);
        if (result.skipped) {
          logger.info("watcher", `unchanged: ${filePath} (skipped)`);
        } else {
          logger.success("watcher", `updated: ${filePath} (+${result.nodes} nodes)`);
        }
      } catch (err) {
        logger.error("watcher", `error re-indexing ${filePath}:`, err);
      }
    })
    .on("unlink", (filePath) => {
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return;
      removeFile(filePath);
      logger.info("watcher", `removed: ${filePath}`);
    })
    .on("ready", () => {
      logger.success("watcher", `ready — watching ${watchPath}`);
      options.onReady?.();
    })
    .on("error", (err) => {
      logger.error("watcher", "error:", err);
      options.onError?.(err as Error);
    });

  return watcher;
}

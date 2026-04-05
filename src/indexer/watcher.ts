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

  const watcher = chokidar.watch(watchPath, {
    ignored: (testPath: string) => {
      // Don't ignore the root watch directory
      if (testPath === watchPath) return false;
      return isIgnored(ig, watchPath, testPath);
    },
    persistent: true,
    ignoreInitial: true, // initial index is done by indexDirectory() — only watch for changes
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

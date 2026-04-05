/**
 * Reset script — deletes the project database so the next `npm run dev` re-indexes from scratch.
 * Usage: npm run reset
 */

import { existsSync, unlinkSync, rmSync } from "fs";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

const dbFiles = [config.dbPath, `${config.dbPath}-shm`, `${config.dbPath}-wal`];

let deleted = 0;

for (const file of dbFiles) {
  if (existsSync(file)) {
    unlinkSync(file);
    deleted++;
  }
}

if (deleted > 0) {
  logger.success("reset", `deleted ${deleted} database file(s) for: ${config.watchPath}`);
  logger.info("reset", `run \`npm run dev\` to re-index from scratch`);
} else {
  logger.info("reset", `no database found for: ${config.watchPath}`);
}

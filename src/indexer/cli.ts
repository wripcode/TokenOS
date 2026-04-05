/**
 * CLI — index a directory using the configured TokenOS parser.
 *
 * Usage: npm run index -- /path/to/project
 * (Path arg overrides tokenos.config.json watchPath for one-shot indexing)
 */

// Import db first to ensure the schema (tables, indexes) is initialized
import "../db/index.js";
import { indexDirectory } from "./indexer.js";
import { computeAllImportance } from "../utils/scoring.js";
import { logger } from "../utils/logger.js";

const targetPath = process.argv[2];
if (!targetPath) {
  logger.error("cli", "Usage: npm run index -- /path/to/project");
  process.exit(1);
}

logger.info("cli", `indexing: ${targetPath}`);
const totals = await indexDirectory(targetPath);
const { updated } = computeAllImportance();
logger.success(
  "cli",
  `done: ${totals.files} files · ${totals.nodes} nodes · ${totals.edges} edges · ${updated} importance scores`,
);

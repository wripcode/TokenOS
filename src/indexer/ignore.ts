import ignore, { type Ignore } from "ignore";
import { logger } from "../utils/logger.js";
import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";

export function createIgnorer(workspacePath: string): Ignore {
  const ig = ignore() as Ignore;
  
  // Default hardcoded ignores
  ig.add(["node_modules", ".git", "dist", ".next", "build", "*.d.ts"]);

  // Read .gitignore if it exists
  const gitignorePath = join(workspacePath, ".gitignore");
  if (existsSync(gitignorePath)) {
    try {
      const content = readFileSync(gitignorePath, "utf-8");
      ig.add(content);
      logger.success("indexer", "applied .gitignore rules");
    } catch (err) {
      logger.error("indexer", "failed to read .gitignore:", err);
    }
  }

  return ig;
}

export function isIgnored(ig: Ignore, workspacePath: string, testPath: string): boolean {
  const relPath = relative(workspacePath, testPath);
  if (!relPath || relPath === "." || relPath.startsWith("..")) {
    return false; // Root directory or outside scope
  }
  return ig.ignores(relPath);
}

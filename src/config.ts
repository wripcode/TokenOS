/**
 * Config loader for TokenOS.
 *
 * Precedence: CLI args → config file → env vars → defaults.
 * Config file: tokenos.config.json in the project root.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

// ───── Types ──────────────────────────────────────────────────────────────────

export interface TokenOSConfig {
  watchPath: string;
  ollama: {
    url: string;
    model: string;
  };
  ui: {
    enabled: boolean;
    port: number;
  };
  distillation: {
    /** Automatically distill after every N captured sessions. Default: 5 */
    everyNSessions: number;
  };
  docs: {
    /** Additional directories (relative to watchPath) to index as searchable docs. Default: ["dev-data", "docs"] */
    paths: string[];
  };
  /** Derived: absolute path to the SQLite DB for the target project */
  dbPath: string;
}

// ───── Loader ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

function loadConfigFile(): Record<string, unknown> {
  const configPath = join(PROJECT_ROOT, "tokenos.config.json");
  if (!existsSync(configPath)) return {};

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildConfig(): TokenOSConfig {
  const file = loadConfigFile();
  const fileOllama = (file.ollama ?? {}) as Record<string, unknown>;
  const fileUI = (file.ui ?? {}) as Record<string, unknown>;

  // CLI args (backwards-compatible: first non-flag arg is watchPath, --ui flag)
  const args = process.argv.slice(2);
  const cliPath = args.find((a) => !a.startsWith("--"));
  const cliUI = args.includes("--ui");

  // Resolve watchPath: CLI > config > cwd
  const rawPath = cliPath ?? (file.watchPath as string | undefined) ?? process.cwd();
  const watchPath = resolve(rawPath);

  // Ollama settings: env > config > defaults
  const ollamaUrl =
    process.env.OLLAMA_URL ??
    (fileOllama.url as string | undefined) ??
    "http://localhost:11434";

  const ollamaModel =
    process.env.EMBEDDING_MODEL ??
    (fileOllama.model as string | undefined) ??
    "nomic-embed-text";

  // UI settings: CLI flag > config > defaults
  const uiEnabled = cliUI || (fileUI.enabled as boolean | undefined) === true;
  const uiPort =
    Number(process.env.GRAPH_UI_PORT) ||
    (fileUI.port as number | undefined) ||
    3333;

  // Per-project DB: <watchPath>/.tokenos/graph.db
  const dbPath = join(watchPath, ".tokenos", "graph.db");

  // Distillation settings
  const fileDist = (file.distillation ?? {}) as Record<string, unknown>;
  const everyNSessions = (fileDist.everyNSessions as number | undefined) ?? 5;

  // Docs ingestion paths
  const fileDocs = (file.docs ?? {}) as Record<string, unknown>;
  const docPaths = (fileDocs.paths as string[] | undefined) ?? ["dev-data", "docs"];

  return {
    watchPath,
    ollama: { url: ollamaUrl, model: ollamaModel },
    ui: { enabled: uiEnabled, port: uiPort },
    distillation: { everyNSessions },
    docs: { paths: docPaths },
    dbPath,
  };
}

/** Singleton config — built once on import */
export const config: TokenOSConfig = buildConfig();

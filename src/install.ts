import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { logger } from "./utils/logger.js";

function buildMcpConfig() {
  return {
    command: "npx",
    args: ["-y", "tokenos", "."],
  };
}

export function getConfigPaths() {
  const home = homedir();
  return [
    {
      name: "Antigravity IDE",
      path: join(home, ".gemini", "config", "mcp_config.json"),
    },
    {
      name: "Cursor (Mac/Linux)",
      path: join(home, ".cursor", "mcp.json"),
    },
    {
      name: "Claude Desktop (Mac)",
      path: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    },
  ];
}

export function getUnconfiguredIDEs(): Array<{ name: string; path: string }> {
  const paths = getConfigPaths();
  const unconfigured = [];

  for (const { name, path } of paths) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        const config = JSON.parse(raw);
        if (!config.mcpServers || !config.mcpServers.tokenos) {
          unconfigured.push({ name, path });
        }
      } catch {
        // If file is unreadable/invalid, assume unconfigured
        unconfigured.push({ name, path });
      }
    }
  }

  return unconfigured;
}

export function installMcpConfig({ silent = false } = {}): void {
  const home = homedir();
  const configPaths = getConfigPaths();

  let installedCount = 0;

  for (const { name, path } of configPaths) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        const config = JSON.parse(raw);

        if (!config.mcpServers) {
          config.mcpServers = {};
        }

        config.mcpServers.tokenos = buildMcpConfig();

        writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
        if (!silent) logger.success("install", `Added TokenOS to ${name} config at ${path}`);
        installedCount++;
      } catch (err) {
        if (!silent) logger.error("install", `Failed to update config for ${name} at ${path}:`, err);
      }
    }
  }

  if (installedCount === 0) {
    const defaultPath = configPaths[0].path;
    try {
      mkdirSync(join(home, ".gemini", "config"), { recursive: true });
      const defaultConfig = {
        mcpServers: {
          tokenos: buildMcpConfig(),
        },
      };
      writeFileSync(defaultPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
      if (!silent) logger.success("install", `Created new Antigravity config at ${defaultPath}`);
      installedCount++;
    } catch (err) {
      if (!silent) logger.error("install", `Failed to create default config at ${defaultPath}:`, err);
    }
  }

  if (!silent) {
    if (installedCount > 0) {
      logger.success("install", "Installation complete. Please restart your IDE for changes to take effect.");
    } else {
      logger.warn("install", "Could not find or create any MCP configuration files.");
    }
  }
}

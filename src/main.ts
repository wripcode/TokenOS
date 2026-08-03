#!/usr/bin/env node

if (process.argv.includes("--version")) {
  console.log("2.2.1");
  process.exit(0);
}

if (process.argv.includes("--install")) {
  // @ts-ignore - Valid Node16 module resolution, tsc false positive
  const { installMcpConfig } = await import("./install.js");
  installMcpConfig();
  process.exit(0);
}

// @ts-ignore - Dynamic import to prevent hoisting of heavy dependencies (like sqlite)
// This ensures `--install` can run instantly without requiring a full DB driver load.
await import("./app.js");

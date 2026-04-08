import pc from "picocolors";

function formatTag(tag: string): string {
  switch (tag) {
    case "tokenos":
      return pc.bold(pc.blue(`[${tag}]`));
    case "indexer":
      return pc.bold(pc.magenta(`[${tag}]`));
    case "watcher":
      return pc.bold(pc.cyan(`[${tag}]`));
    case "embeddings":
      return pc.bold(pc.yellow(`[${tag}]`));
    default:
      return pc.bold(pc.gray(`[${tag}]`));
  }
}

export const logger = {
  info: (tag: string, message: string) => {
    console.error(`${formatTag(tag)} ${message}`);
  },
  success: (tag: string, message: string) => {
    console.error(`${formatTag(tag)} ${pc.green(message)}`);
  },
  warn: (tag: string, message: string) => {
    console.error(`${formatTag(tag)} ${pc.yellow(message)}`);
  },
  error: (tag: string, message: string, err?: any) => {
    if (err) {
      console.error(`${formatTag(tag)} ${pc.red(message)}`, err);
    } else {
      console.error(`${formatTag(tag)} ${pc.red(message)}`);
    }
  },
  viteLike: (params: { 
    version: string; 
    timeMs: number; 
    localUrl?: string; 
    ollamaOk?: boolean;
    sqliteOk?: boolean;
    cwd?: string;
    model?: string;
  }) => {
    console.error("");
    console.error(`  ${pc.bold(pc.green("TOKENOS"))} ${pc.dim(`v${params.version}`)}  ready in ${pc.bold(`${params.timeMs} ms`)}`);
    console.error("");
    if (params.cwd) {
      console.error(`  ${pc.green("➜")}  ${pc.bold("Watching:")} ${pc.cyan(params.cwd)}`);
    }
    if (params.localUrl) {
      console.error(`  ${pc.green("➜")}  ${pc.bold("Local:")}    ${pc.cyan(params.localUrl)}`);
    }
    
    // Health checks
    if (params.ollamaOk) {
      console.error(`  ${pc.green("➜")}  ${pc.bold("Ollama:")}   ${pc.green("ok")}${params.model ? ` ${pc.dim(`(${params.model})`)}` : ""}`);
    }
    
    const sqliteStatus = params.sqliteOk ? pc.green("ok") : pc.red("error");
    console.error(`  ${pc.green("➜")}  ${pc.bold("SQLite:")}   ${sqliteStatus}`);
    console.error("");
  }
};

export { parseFile, removeFile, hashContent } from "./parser.js";
export type { ParseResult } from "./parser.js";
export { indexFile, removeFile as removeIndexedFile, indexDirectory } from "./indexer.js";
export { startWatcher } from "./watcher.js";
